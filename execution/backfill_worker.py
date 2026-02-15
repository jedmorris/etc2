"""
Backfill Worker - full historical data load for a single user.
Triggered after onboarding completes.
"""

import logging
from datetime import datetime, timezone
from supabase_client import get_client

log = logging.getLogger(__name__)


def _set_backfill_status(db, user_id: str, status: str, **extra_fields) -> None:
    """Update the backfill tracking fields on profiles."""
    update = {"backfill_status": status, **extra_fields}
    db.table("profiles").update(update).eq("user_id", user_id).execute()


def run(user_id: str) -> int:
    """Run full backfill for a user. Returns total records processed."""
    db = get_client()
    total = 0

    # Mark backfill as in progress
    _set_backfill_status(
        db, user_id, "in_progress",
        backfill_started_at=datetime.now(timezone.utc).isoformat(),
    )

    # Determine which platforms are connected
    accounts = (
        db.table("connected_accounts")
        .select("platform, status")
        .eq("user_id", user_id)
        .eq("status", "connected")
        .execute()
    )

    platforms = [a["platform"] for a in (accounts.data or [])]
    had_failure = False

    # Run sync for each platform (orders first, then supplementary data)
    for platform in platforms:
        try:
            if platform == "etsy":
                from etsy_sync_orders import run as sync_orders
                from etsy_sync_listings import run as sync_listings
                from etsy_sync_payments import run as sync_payments

                total += sync_orders(user_id)
                total += sync_listings(user_id)
                total += sync_payments(user_id)

            elif platform == "shopify":
                from shopify_sync_orders import run as sync_orders
                from shopify_sync_products import run as sync_products
                from shopify_sync_customers import run as sync_customers

                total += sync_orders(user_id)
                total += sync_products(user_id)
                total += sync_customers(user_id)

            elif platform == "printify":
                from printify_sync_orders import run as sync_orders
                from printify_sync_products import run as sync_products

                total += sync_orders(user_id)
                total += sync_products(user_id)

        except Exception as e:
            had_failure = True
            log.error("Backfill failed for platform=%s user=%s: %s", platform, user_id, e)
            # Log error but continue with other platforms
            db.table("sync_log").insert({
                "user_id": user_id,
                "platform": platform,
                "sync_type": "backfill",
                "status": "failed",
                "error_message": str(e)[:500],
            }).execute()

    # Update backfill status
    if had_failure and total == 0:
        _set_backfill_status(db, user_id, "failed")
    else:
        _set_backfill_status(
            db, user_id, "completed",
            backfill_completed_at=datetime.now(timezone.utc).isoformat(),
        )

    # Log completion
    db.table("sync_log").insert({
        "user_id": user_id,
        "platform": "all",
        "sync_type": "backfill",
        "status": "completed" if not had_failure else "partial",
        "records_synced": total,
    }).execute()

    # Send completion email
    if not had_failure or total > 0:
        try:
            _send_completion_email(db, user_id, total)
        except Exception as e:
            log.error("Failed to send backfill completion email: %s", e)

    return total


def _send_completion_email(db, user_id: str, records_synced: int) -> None:
    """Send backfill completion email to user."""
    result = (
        db.table("profiles")
        .select("email")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data or not result.data[0].get("email"):
        return

    import email_alerts
    email_alerts.send_backfill_complete_alert(result.data[0]["email"], records_synced)
