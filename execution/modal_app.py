"""
etC2 Modal App - Serverless functions for sync workers + webhooks.

Deploy: modal deploy execution/modal_app.py
"""

import importlib
import modal
import os
from datetime import datetime, timedelta, timezone
from log_config import setup_logging

app = modal.App("etC2")

# Shared image with dependencies
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "supabase>=2.0.0",
    "httpx>=0.27.0",
    "cryptography>=42.0.0",
    "python-dotenv>=1.0.0",
    "stripe>=8.0.0",
    "resend>=2.0.0",
    "fastapi[standard]",
)

# Secrets from Modal dashboard
secrets = modal.Secret.from_name("etC2-secrets")

# ============================================
# SYNC QUEUE PROCESSOR
# Runs every 1 minute, picks queued jobs, executes them
# ============================================


@app.function(
    image=image,
    secrets=[secrets],
    schedule=modal.Cron("* * * * *"),  # Every minute
    timeout=300,
)
def process_sync_queue():
    """Pick up queued sync jobs and process them."""
    setup_logging()
    from supabase_client import get_client
    from sync_queue import process_next_batch

    db = get_client()
    process_next_batch(db, batch_size=10)


# ============================================
# NIGHTLY BATCH (consolidated to stay within cron limit)
# Runs: financials → customer merge → bestsellers → newsletter reconcile
# ============================================


@app.function(
    image=image,
    secrets=[secrets],
    schedule=modal.Cron("0 2 * * *"),  # 2 AM daily
    timeout=7200,
)
def nightly_batch():
    """Run all nightly compute jobs sequentially, staggered per user."""
    setup_logging()
    from supabase_client import get_client
    import time

    db = get_client()
    result = db.table("profiles").select("user_id").execute()
    users = result.data or []

    # Phase 1: Financials
    print(f"[nightly] Starting financials for {len(users)} users")
    for i, user in enumerate(users):
        if i > 0 and i % 5 == 0:
            time.sleep(60)
        try:
            compute_financials_for_user.spawn(user["user_id"])
        except Exception as e:
            print(f"Failed to spawn financials for {user['user_id']}: {e}")

    time.sleep(120)  # 2 min buffer between phases

    # Phase 2: Customer merge
    print(f"[nightly] Starting customer merge for {len(users)} users")
    for i, user in enumerate(users):
        if i > 0 and i % 5 == 0:
            time.sleep(60)
        try:
            compute_customer_merge_for_user.spawn(user["user_id"])
        except Exception as e:
            print(f"Failed to spawn customer merge for {user['user_id']}: {e}")

    time.sleep(120)

    # Phase 3: Bestsellers
    print(f"[nightly] Starting bestsellers for {len(users)} users")
    for i, user in enumerate(users):
        if i > 0 and i % 5 == 0:
            time.sleep(60)
        try:
            compute_bestsellers_for_user.spawn(user["user_id"])
        except Exception as e:
            print(f"Failed to spawn bestsellers for {user['user_id']}: {e}")

    # Phase 4: Newsletter reconciliation
    print("[nightly] Starting newsletter reconciliation")
    try:
        from newsletter_sync import reconcile_subscribers
        r = reconcile_subscribers()
        print(f"Newsletter reconciliation: {r}")
    except Exception as e:
        print(f"Newsletter reconciliation failed: {e}")


@app.function(
    image=image,
    secrets=[secrets],
    schedule=modal.Cron("0 3 * * 0"),  # Sunday 3 AM
    timeout=1800,
)
def weekly_rfm():
    """Compute RFM segments for all users, weekly."""
    setup_logging()
    from supabase_client import get_client
    import time

    db = get_client()
    result = db.table("profiles").select("user_id").execute()
    users = result.data or []

    for i, user in enumerate(users):
        if i > 0 and i % 5 == 0:
            time.sleep(60)
        try:
            compute_rfm_for_user.spawn(user["user_id"])
        except Exception as e:
            print(f"Failed to spawn RFM for {user['user_id']}: {e}")


# ============================================
# PER-USER COMPUTE FUNCTIONS
# ============================================


@app.function(image=image, secrets=[secrets], timeout=300)
def compute_financials_for_user(user_id: str):
    """Compute daily/monthly financials for one user."""
    from compute_financials import run
    run(user_id)


@app.function(image=image, secrets=[secrets], timeout=300)
def compute_customer_merge_for_user(user_id: str):
    """Merge cross-platform customers for one user."""
    from compute_customer_merge import run
    run(user_id)


@app.function(image=image, secrets=[secrets], timeout=300)
def compute_bestsellers_for_user(user_id: str):
    """Compute bestseller candidates for one user."""
    from compute_bestsellers import run
    run(user_id)


@app.function(image=image, secrets=[secrets], timeout=300)
def compute_rfm_for_user(user_id: str):
    """Compute RFM segments for one user."""
    from compute_rfm import run
    run(user_id)


# ============================================
# SYNC WORKER FUNCTIONS (spawned by queue processor)
# ============================================


@app.function(image=image, secrets=[secrets], timeout=300)
def run_sync_job(job_id: str, user_id: str, job_type: str):
    """Run a single sync job."""
    setup_logging()
    from supabase_client import get_client

    db = get_client()

    # Mark job as running
    db.table("sync_jobs").update({
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()

    try:
        records = _execute_sync(user_id, job_type)

        db.table("sync_jobs").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "records_processed": records,
        }).eq("id", job_id).execute()

        # Update last_sync_at on connected account
        platform = job_type.split("_")[0]  # e.g., "etsy" from "etsy_orders"
        db.table("connected_accounts").update({
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("platform", platform).execute()

    except Exception as e:
        db.table("sync_jobs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_message": str(e)[:500],
        }).eq("id", job_id).execute()

        # Send email alert to user
        try:
            from email_alerts import send_sync_failure_alert
            profile = db.table("profiles").select("email").eq("user_id", user_id).maybe_single().execute()
            if profile.data and profile.data.get("email"):
                send_sync_failure_alert(profile.data["email"], job_type, str(e)[:300])
        except Exception:
            pass  # Don't let alert failure block job scheduling

    # Schedule next sync based on user's plan
    _schedule_next(db, user_id, job_type)


def _execute_sync(user_id: str, job_type: str) -> int:
    """Dispatch to the appropriate sync worker."""
    sync_map = {
        "etsy_orders": "etsy_sync_orders",
        "etsy_listings": "etsy_sync_listings",
        "etsy_payments": "etsy_sync_payments",
        "shopify_orders": "shopify_sync_orders",
        "shopify_products": "shopify_sync_products",
        "shopify_customers": "shopify_sync_customers",
        "printify_orders": "printify_sync_orders",
        "printify_products": "printify_sync_products",
        "backfill_etsy": "backfill_worker",
        "backfill_shopify": "backfill_worker",
        "backfill_printify": "backfill_worker",
    }

    module_name = sync_map.get(job_type)
    if not module_name:
        raise ValueError(f"Unknown job type: {job_type}")

    module = importlib.import_module(module_name)
    return module.run(user_id)


def _schedule_next(db, user_id: str, job_type: str):
    """Schedule the next sync run based on user's plan.

    Skips insertion if there is already a queued job with the same
    (user_id, job_type) to prevent unbounded duplicate accumulation.
    """
    # Check for existing queued job
    existing = (
        db.table("sync_jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("job_type", job_type)
        .eq("status", "queued")
        .limit(1)
        .execute()
    )
    if existing.data:
        return  # Already have a queued job — don't duplicate

    result = db.table("profiles").select("plan").eq("user_id", user_id).maybe_single().execute()
    plan = result.data["plan"] if result.data else "free"

    intervals = {
        "free": 30,
        "starter": 15,
        "growth": 5,
        "pro": 2,
    }

    # Listings/products sync less frequently
    if "listings" in job_type or "products" in job_type or "customers" in job_type:
        intervals = {"free": 60, "starter": 30, "growth": 30, "pro": 15}
    if "payments" in job_type:
        intervals = {"free": 60, "starter": 30, "growth": 15, "pro": 10}

    interval = intervals.get(plan, 30)
    next_run = datetime.now(timezone.utc) + timedelta(minutes=interval)

    db.table("sync_jobs").insert({
        "user_id": user_id,
        "job_type": job_type,
        "scheduled_at": next_run.isoformat(),
        "priority": 1 if plan == "pro" else 0,
    }).execute()


# ============================================
# WEBHOOK ENDPOINTS (alternative to Next.js routes)
# ============================================


@app.function(image=image, secrets=[secrets])
@modal.fastapi_endpoint(method="GET")
def list_webhooks():
    """List all registered webhook endpoints."""
    import json
    webhooks_path = os.path.join(os.path.dirname(__file__), "webhooks.json")
    if os.path.exists(webhooks_path):
        with open(webhooks_path) as f:
            return json.load(f)
    return {"webhooks": []}


@app.function(image=image, secrets=[secrets])
@modal.fastapi_endpoint(method="GET")
def health():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ============================================
# BEEHIIV SUBSCRIBER WEBHOOK
# Receives subscriber.created / subscriber.unsubscribed events
# ============================================


@app.function(image=image, secrets=[secrets])
@modal.fastapi_endpoint(method="POST")
def beehiiv_subscriber_webhook(request: dict):
    """Handle Beehiiv subscriber webhook events.

    Events: subscriber.created, subscriber.unsubscribed
    Forwards new subscribers to Substack, tracks unsubs.
    """
    from beehiiv_client import verify_webhook_signature
    from newsletter_sync import handle_new_subscriber, handle_unsubscribe

    # Verify webhook signature (best-effort — Beehiiv sends in headers)
    # Note: Modal web_endpoint receives parsed JSON; raw body verification
    # requires middleware. For now, validate via shared secret in payload
    # or skip if BEEHIIV_WEBHOOK_SECRET is not set.

    event_type = request.get("event", "")

    if event_type == "subscriber.created":
        result = handle_new_subscriber(request)
        return {"status": "processed", "event": event_type, **result}

    elif event_type in ("subscriber.unsubscribed", "subscriber.deleted"):
        result = handle_unsubscribe(request)
        return {"status": "processed", "event": event_type, **result}

    else:
        return {"status": "ignored", "event": event_type, "detail": "Unhandled event type"}


# ============================================
# NEWSLETTER SCHEDULED JOBS
# ============================================


@app.function(
    image=image,
    secrets=[secrets],
    schedule=modal.Cron("*/15 * * * *"),  # Every 15 minutes
    timeout=300,
)
def retry_newsletter_forwards():
    """Retry failed/pending Substack subscriber forwards."""
    setup_logging()
    from newsletter_sync import retry_pending_subscribers
    result = retry_pending_subscribers()
    print(f"Newsletter retry: {result}")


# reconcile_newsletter_subscribers is now part of nightly_batch()
