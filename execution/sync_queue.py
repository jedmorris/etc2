"""
Sync Queue Processor - picks queued jobs and dispatches them.
Called by Modal scheduler every 1 minute.
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase import Client
import rate_limiter

log = logging.getLogger(__name__)

PLAN_WEIGHTS = {"free": 0, "starter": 1, "growth": 2, "pro": 3}
JOB_TYPE_WEIGHTS = {"orders": 5, "listings": 3, "products": 3, "payments": 2, "customers": 2}
MAX_CONCURRENT_JOBS = 10


def _cleanup_stale_jobs(db: Client, stale_minutes: int = 15) -> None:
    """Mark jobs stuck in 'running' for longer than *stale_minutes* as failed.

    This handles crashed workers that never reported back.
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=stale_minutes)
    ).isoformat()

    db.table("sync_jobs").update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": f"Stale: still running after {stale_minutes} min",
    }).eq("status", "running").lt("started_at", cutoff).execute()


def _check_concurrency_cap(db: Client) -> bool:
    """Return True if under the concurrency cap, False if at/over."""
    result = (
        db.table("sync_jobs")
        .select("id", count="exact")
        .eq("status", "running")
        .execute()
    )
    running_count = result.count or 0
    if running_count >= MAX_CONCURRENT_JOBS:
        log.warning("Concurrency cap reached: %d/%d running jobs", running_count, MAX_CONCURRENT_JOBS)
        return False
    return True


def _check_plan_limits(db: Client, user_id: str) -> bool:
    """Check if user is within their plan's order limit.

    Returns True if allowed to proceed, False if limit exceeded on free plan.
    Paid plans always return True (overage billed separately).
    """
    result = (
        db.table("profiles")
        .select("plan, monthly_order_count, monthly_order_limit")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return False
    profile = result.data[0]
    plan = profile.get("plan", "free")
    count = profile.get("monthly_order_count", 0)
    limit = profile.get("monthly_order_limit", 50)

    if count >= limit and plan == "free":
        return False
    return True


def _compute_priority(plan: str, job_type: str) -> int:
    """Compute priority score based on plan tier and job type."""
    plan_weight = PLAN_WEIGHTS.get(plan, 0)
    # Extract the suffix (e.g., "orders" from "etsy_orders" or "backfill_etsy")
    suffix = job_type.split("_")[-1] if "_" in job_type else job_type
    job_weight = JOB_TYPE_WEIGHTS.get(suffix, 1)
    return plan_weight * 10 + job_weight


def process_next_batch(db: Client, batch_size: int = 10):
    """Pick up the next batch of queued sync jobs and process them."""
    _cleanup_stale_jobs(db)

    # Check concurrency cap before fetching any jobs
    if not _check_concurrency_cap(db):
        return

    now = datetime.now(timezone.utc).isoformat()

    # Fetch queued jobs that are ready to run
    result = (
        db.table("sync_jobs")
        .select("id, user_id, job_type, priority, metadata")
        .eq("status", "queued")
        .lte("scheduled_at", now)
        .order("priority", desc=True)
        .order("scheduled_at")
        .limit(batch_size)
        .execute()
    )

    jobs = result.data or []

    for job in jobs:
        user_id = job["user_id"]
        job_type = job["job_type"]
        platform = job_type.split("_")[0]

        # Check plan is active
        if not _check_plan_active(db, user_id):
            _skip_job(db, job["id"], "User plan inactive or past_due")
            continue

        # Check plan order limits
        if not _check_plan_limits(db, user_id):
            _skip_job(db, job["id"], "Plan order limit reached")
            continue

        # Check rate limit budget
        if not rate_limiter.can_make_request(user_id, platform):
            remaining = rate_limiter.get_remaining_budget(user_id, platform)
            global_info = rate_limiter.get_global_usage(platform)
            log.warning(
                "Rate limit hit: user=%s platform=%s remaining=%d global_used=%d/%d — re-queuing job %s in 5m",
                user_id, platform, remaining, global_info["used"], global_info["budget"], job["id"],
            )
            _requeue_job(db, job["id"], minutes=5)
            continue

        # Dispatch the job (Modal spawns it async)
        try:
            from modal_app import run_sync_job
            run_sync_job.spawn(job["id"], user_id, job_type)
        except Exception as e:
            _fail_job(db, job["id"], str(e))


def _check_plan_active(db: Client, user_id: str) -> bool:
    """Check if user's plan is active (not past_due or cancelled)."""
    result = (
        db.table("profiles")
        .select("plan_status")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return False
    return result.data[0]["plan_status"] == "active"


def _skip_job(db: Client, job_id: str, reason: str):
    """Mark a job as failed due to skip reason."""
    db.table("sync_jobs").update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": reason,
    }).eq("id", job_id).execute()


def _requeue_job(db: Client, job_id: str, minutes: int = 5):
    """Push a job's scheduled_at forward."""
    new_time = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    db.table("sync_jobs").update({
        "scheduled_at": new_time.isoformat(),
    }).eq("id", job_id).execute()


def _fail_job(db: Client, job_id: str, error: str):
    """Mark a job as failed."""
    db.table("sync_jobs").update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": error[:500],
    }).eq("id", job_id).execute()


def schedule_initial_jobs(db: Client, user_id: str, platforms: list[str]):
    """Schedule initial sync jobs after user connects platforms.
    Called during onboarding after connections are established.
    """
    # Look up user's plan for priority weighting
    profile_result = (
        db.table("profiles")
        .select("plan")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    plan = profile_result.data[0]["plan"] if profile_result.data else "free"

    jobs = []
    platform_job_types = {
        "etsy": ["etsy_orders", "etsy_listings", "etsy_payments"],
        "shopify": ["shopify_orders", "shopify_products", "shopify_customers"],
        "printify": ["printify_orders", "printify_products"],
    }

    for platform in platforms:
        for job_type in platform_job_types.get(platform, []):
            jobs.append({
                "user_id": user_id,
                "job_type": job_type,
                "priority": _compute_priority(plan, job_type),
            })

    if jobs:
        db.table("sync_jobs").insert(jobs).execute()


def schedule_backfill(db: Client, user_id: str, platforms: list[str]):
    """Schedule backfill jobs for a user after onboarding."""
    jobs = []
    for platform in platforms:
        jobs.append({
            "user_id": user_id,
            "job_type": f"backfill_{platform}",
            "priority": 5,
            "metadata": {"is_backfill": True},
        })

    if jobs:
        db.table("sync_jobs").insert(jobs).execute()
