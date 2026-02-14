"""
Sync Queue Processor - picks queued jobs and dispatches them.
Called by Modal scheduler every 1 minute.
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase import Client
import rate_limiter

log = logging.getLogger(__name__)


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


def process_next_batch(db: Client, batch_size: int = 10):
    """Pick up the next batch of queued sync jobs and process them."""
    _cleanup_stale_jobs(db)

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

        # Check plan limits
        if not _check_plan_active(db, user_id):
            _skip_job(db, job["id"], "User plan inactive or past_due")
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
        .maybe_single()
        .execute()
    )
    if not result.data:
        return False
    return result.data["plan_status"] == "active"


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
                "priority": 10,  # High priority for initial sync
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
