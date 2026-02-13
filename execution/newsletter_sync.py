"""
Newsletter subscriber sync: Beehiiv → Substack.

Handles:
1. New subscriber webhook from Beehiiv → forward to Substack
2. Unsubscribe webhook from Beehiiv → flag for Substack removal
3. Periodic reconciliation between platforms

Called by Modal webhook endpoints and scheduled jobs.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from supabase_client import get_client

log = logging.getLogger(__name__)

# Default user_id — set in .env for single-tenant newsletter use.
# Multi-tenant: pass user_id from webhook metadata or lookup.
import os
DEFAULT_USER_ID = os.getenv("NEWSLETTER_OWNER_USER_ID", "")


# ---------------------------------------------------------------------------
# Webhook handlers
# ---------------------------------------------------------------------------


def handle_new_subscriber(payload: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    """Process a Beehiiv subscriber.created webhook event.

    1. Extract subscriber data from webhook payload
    2. Upsert into newsletter_subscribers table
    3. Forward to Substack subscribe endpoint
    4. Log the sync attempt

    Returns dict with sync result.
    """
    uid = user_id or DEFAULT_USER_ID
    if not uid:
        return {"error": "No user_id provided and NEWSLETTER_OWNER_USER_ID not set"}

    db = get_client()

    # Extract subscriber data from Beehiiv webhook payload
    data = payload.get("data", {})
    email = data.get("email", "")
    if not email:
        return {"error": "No email in webhook payload"}

    beehiiv_id = data.get("id", "")
    tags = [t.get("name", "") for t in data.get("tags", [])] if data.get("tags") else []
    utm_source = data.get("utm_source")
    utm_medium = data.get("utm_medium")
    utm_campaign = data.get("utm_campaign")

    now = datetime.now(timezone.utc).isoformat()

    # Upsert subscriber record
    sub_row = {
        "user_id": uid,
        "email": email,
        "beehiiv_subscriber_id": beehiiv_id,
        "beehiiv_status": "active",
        "tags": tags,
        "utm_source": utm_source,
        "utm_medium": utm_medium,
        "utm_campaign": utm_campaign,
        "beehiiv_created_at": data.get("created", now),
        "last_webhook_at": now,
    }

    resp = (
        db.table("newsletter_subscribers")
        .upsert(sub_row, on_conflict="user_id,email")
        .execute()
    )
    sub_record = resp.data[0] if resp.data else sub_row
    sub_id = sub_record.get("id")

    # Forward to Substack
    from substack_client import subscribe as substack_subscribe

    result = substack_subscribe(email)

    # Update subscriber status based on Substack response
    if result["success"]:
        substack_status = "confirmation_sent"
    elif result["status_code"] == 429:
        substack_status = "pending"  # Will retry
    else:
        substack_status = "failed"

    db.table("newsletter_subscribers").update({
        "substack_status": substack_status,
        "synced_to_substack_at": now if result["success"] else None,
        "error_message": None if result["success"] else result["detail"],
    }).eq("user_id", uid).eq("email", email).execute()

    # Log sync attempt
    db.table("newsletter_sync_log").insert({
        "user_id": uid,
        "subscriber_id": sub_id,
        "action": "subscribe",
        "source": "beehiiv_webhook",
        "status": "success" if result["success"] else "failed",
        "error_message": None if result["success"] else result["detail"],
        "metadata": {
            "beehiiv_id": beehiiv_id,
            "substack_status_code": result["status_code"],
            "tags": tags,
        },
    }).execute()

    log.info(
        "Processed new subscriber %s → Substack: %s",
        email, substack_status,
    )

    return {
        "email": email,
        "beehiiv_id": beehiiv_id,
        "substack_status": substack_status,
        "detail": result["detail"],
    }


def handle_unsubscribe(payload: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    """Process a Beehiiv subscriber.unsubscribed webhook event.

    1. Update beehiiv_status to 'unsubscribed' in our DB
    2. Flag for Substack removal (cannot auto-remove via API)
    3. Log the event

    Returns dict with result.
    """
    uid = user_id or DEFAULT_USER_ID
    if not uid:
        return {"error": "No user_id provided and NEWSLETTER_OWNER_USER_ID not set"}

    db = get_client()

    data = payload.get("data", {})
    email = data.get("email", "")
    if not email:
        return {"error": "No email in webhook payload"}

    beehiiv_id = data.get("id", "")
    now = datetime.now(timezone.utc).isoformat()

    # Update subscriber status
    db.table("newsletter_subscribers").update({
        "beehiiv_status": "unsubscribed",
        "substack_status": "pending_unsub",  # Flagged for manual Substack removal
        "last_webhook_at": now,
    }).eq("user_id", uid).eq("email", email).execute()

    # Log sync attempt
    # Look up subscriber_id for the log
    sub_resp = (
        db.table("newsletter_subscribers")
        .select("id")
        .eq("user_id", uid)
        .eq("email", email)
        .maybe_single()
        .execute()
    )
    sub_id = sub_resp.data.get("id") if sub_resp.data else None

    db.table("newsletter_sync_log").insert({
        "user_id": uid,
        "subscriber_id": sub_id,
        "action": "unsubscribe",
        "source": "beehiiv_webhook",
        "status": "success",
        "metadata": {
            "beehiiv_id": beehiiv_id,
            "note": "Flagged for manual Substack removal — no API available",
        },
    }).execute()

    log.info("Processed unsubscribe for %s (flagged for Substack removal)", email)

    return {
        "email": email,
        "beehiiv_status": "unsubscribed",
        "substack_note": "Flagged for manual removal — Substack has no unsubscribe API",
    }


# ---------------------------------------------------------------------------
# Retry failed forwards
# ---------------------------------------------------------------------------


def retry_pending_subscribers(user_id: str | None = None) -> dict[str, Any]:
    """Retry forwarding subscribers that are pending or failed for Substack.

    Called by a scheduled job to catch any that failed on first attempt.
    """
    uid = user_id or DEFAULT_USER_ID
    if not uid:
        return {"error": "No user_id"}

    db = get_client()
    from substack_client import subscribe as substack_subscribe

    # Find subscribers needing retry
    resp = (
        db.table("newsletter_subscribers")
        .select("id, email")
        .eq("user_id", uid)
        .eq("beehiiv_status", "active")
        .in_("substack_status", ["pending", "failed"])
        .limit(50)
        .execute()
    )

    pending = resp.data or []
    results = {"retried": 0, "succeeded": 0, "failed": 0}

    now = datetime.now(timezone.utc).isoformat()

    for sub in pending:
        result = substack_subscribe(sub["email"])
        results["retried"] += 1

        if result["success"]:
            results["succeeded"] += 1
            db.table("newsletter_subscribers").update({
                "substack_status": "confirmation_sent",
                "synced_to_substack_at": now,
                "error_message": None,
            }).eq("id", sub["id"]).execute()
        else:
            results["failed"] += 1
            db.table("newsletter_subscribers").update({
                "error_message": result["detail"],
            }).eq("id", sub["id"]).execute()

        # Log each retry
        db.table("newsletter_sync_log").insert({
            "user_id": uid,
            "subscriber_id": sub["id"],
            "action": "subscribe",
            "source": "retry_job",
            "status": "success" if result["success"] else "failed",
            "error_message": None if result["success"] else result["detail"],
        }).execute()

    log.info("Retry job: %d retried, %d succeeded, %d failed", **results)
    return results


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


def reconcile_subscribers(user_id: str | None = None) -> dict[str, Any]:
    """Compare Beehiiv subscriber list against our DB.

    Catches subscribers that were:
    - Added to Beehiiv outside the webhook flow
    - Unsubscribed from Beehiiv without a webhook firing
    - Missing from our DB for any reason

    Run this on a schedule (e.g., daily at 5 AM).
    """
    uid = user_id or DEFAULT_USER_ID
    if not uid:
        return {"error": "No user_id"}

    db = get_client()
    from beehiiv_client import get_all_subscribers
    from substack_client import subscribe as substack_subscribe

    now = datetime.now(timezone.utc).isoformat()
    results = {"new": 0, "unsubscribed": 0, "forwarded": 0, "errors": 0}

    # Fetch all active Beehiiv subscribers
    beehiiv_subs = get_all_subscribers(status="active")
    beehiiv_emails = {s.get("email", "").lower() for s in beehiiv_subs}

    # Fetch all our tracked subscribers
    db_resp = (
        db.table("newsletter_subscribers")
        .select("id, email, beehiiv_status, substack_status")
        .eq("user_id", uid)
        .execute()
    )
    db_subs = {s["email"].lower(): s for s in (db_resp.data or [])}

    # Find new subscribers in Beehiiv not in our DB
    for bsub in beehiiv_subs:
        email = bsub.get("email", "").lower()
        if not email:
            continue

        if email not in db_subs:
            # New subscriber — add to DB and forward to Substack
            tags = [t.get("name", "") for t in bsub.get("tags", [])] if bsub.get("tags") else []

            db.table("newsletter_subscribers").upsert({
                "user_id": uid,
                "email": email,
                "beehiiv_subscriber_id": bsub.get("id", ""),
                "beehiiv_status": "active",
                "tags": tags,
                "beehiiv_created_at": bsub.get("created"),
                "last_webhook_at": now,
            }, on_conflict="user_id,email").execute()

            # Forward to Substack
            result = substack_subscribe(email)
            status = "confirmation_sent" if result["success"] else "failed"

            db.table("newsletter_subscribers").update({
                "substack_status": status,
                "synced_to_substack_at": now if result["success"] else None,
            }).eq("user_id", uid).eq("email", email).execute()

            results["new"] += 1
            if result["success"]:
                results["forwarded"] += 1
            else:
                results["errors"] += 1

            db.table("newsletter_sync_log").insert({
                "user_id": uid,
                "action": "subscribe",
                "source": "reconciliation",
                "status": "success" if result["success"] else "failed",
                "error_message": None if result["success"] else result["detail"],
                "metadata": {"email": email},
            }).execute()

    # Find subscribers in our DB that are no longer active in Beehiiv
    for email, db_sub in db_subs.items():
        if db_sub["beehiiv_status"] == "active" and email not in beehiiv_emails:
            db.table("newsletter_subscribers").update({
                "beehiiv_status": "unsubscribed",
                "substack_status": "pending_unsub",
            }).eq("id", db_sub["id"]).execute()

            results["unsubscribed"] += 1

            db.table("newsletter_sync_log").insert({
                "user_id": uid,
                "action": "unsubscribe",
                "source": "reconciliation",
                "status": "success",
                "metadata": {"email": email, "note": "Not found in Beehiiv active list"},
            }).execute()

    log.info(
        "Reconciliation: %d new, %d forwarded, %d unsubscribed, %d errors",
        results["new"], results["forwarded"], results["unsubscribed"], results["errors"],
    )
    return results


# ---------------------------------------------------------------------------
# Stats helper
# ---------------------------------------------------------------------------


def get_subscriber_stats(user_id: str | None = None) -> dict[str, Any]:
    """Get subscriber counts by status for the dashboard."""
    uid = user_id or DEFAULT_USER_ID
    if not uid:
        return {}

    db = get_client()
    resp = (
        db.table("newsletter_subscribers")
        .select("beehiiv_status, substack_status")
        .eq("user_id", uid)
        .execute()
    )
    subs = resp.data or []

    stats = {
        "total": len(subs),
        "beehiiv_active": sum(1 for s in subs if s["beehiiv_status"] == "active"),
        "beehiiv_unsubscribed": sum(1 for s in subs if s["beehiiv_status"] == "unsubscribed"),
        "substack_confirmed": sum(1 for s in subs if s["substack_status"] == "confirmation_sent"),
        "substack_pending": sum(1 for s in subs if s["substack_status"] == "pending"),
        "substack_failed": sum(1 for s in subs if s["substack_status"] == "failed"),
        "pending_unsub": sum(1 for s in subs if s["substack_status"] == "pending_unsub"),
    }
    return stats
