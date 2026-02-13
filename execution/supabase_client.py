"""
Shared Supabase client for etC2 sync workers.

Uses the service-role key to bypass Row Level Security (RLS),
enabling backend workers to read/write any tenant's data.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: Client | None = None


def get_client() -> Client:
    """Return a module-level Supabase client (lazy singleton)."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


# ---------------------------------------------------------------------------
# User / Account helpers
# ---------------------------------------------------------------------------


def get_user_profile(user_id: str) -> dict[str, Any] | None:
    """Fetch a single user profile by ID.

    Returns the row as a dict, or None if not found.
    """
    resp = (
        get_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return resp.data


def get_connected_account(
    user_id: str, platform: str
) -> dict[str, Any] | None:
    """Fetch the connected-account row for a user + platform.

    ``platform`` is e.g. "etsy" or "shopify".
    Returns the row as a dict, or None if no connection exists.
    """
    resp = (
        get_client()
        .table("connected_accounts")
        .select("*")
        .eq("user_id", user_id)
        .eq("platform", platform)
        .maybe_single()
        .execute()
    )
    return resp.data


# ---------------------------------------------------------------------------
# Order helpers
# ---------------------------------------------------------------------------


def upsert_order(user_id: str, order_data: dict[str, Any]) -> dict[str, Any]:
    """Upsert an order row for a given user.

    ``order_data`` must include at least ``platform_order_id`` and
    ``platform`` so the upsert can match on the natural key.  The
    ``user_id`` is injected automatically.

    Returns the upserted row.
    """
    payload = {**order_data, "user_id": user_id}
    resp = (
        get_client()
        .table("orders")
        .upsert(payload, on_conflict="user_id,platform,platform_order_id")
        .execute()
    )
    return resp.data[0] if resp.data else payload


# ---------------------------------------------------------------------------
# Sync-log helpers
# ---------------------------------------------------------------------------


def insert_sync_log(
    user_id: str,
    platform: str,
    sync_type: str,
    status: str = "started",
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Insert a row into ``sync_logs`` and return it.

    Parameters
    ----------
    user_id:
        The tenant who owns this sync run.
    platform:
        "etsy" | "shopify" etc.
    sync_type:
        A short label like "orders", "listings", "inventory".
    status:
        Initial status -- typically "started".
    details:
        Arbitrary JSON payload (error messages, counts, etc.).
    """
    row = {
        "user_id": user_id,
        "platform": platform,
        "sync_type": sync_type,
        "status": status,
        "details": details or {},
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = get_client().table("sync_logs").insert(row).execute()
    return resp.data[0] if resp.data else row


# ---------------------------------------------------------------------------
# Sync-job queue helpers
# ---------------------------------------------------------------------------


def get_queued_sync_jobs(limit: int = 10) -> list[dict[str, Any]]:
    """Return up to ``limit`` sync jobs with status 'queued',
    ordered oldest-first (FIFO).
    """
    resp = (
        get_client()
        .table("sync_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def update_sync_job_status(
    job_id: str,
    status: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Update the status (and optional details) of a sync job.

    Common status transitions: queued -> running -> completed | failed.
    If ``status`` is "completed" or "failed", ``finished_at`` is set
    automatically.
    """
    payload: dict[str, Any] = {"status": status}
    if details is not None:
        payload["details"] = details
    if status in ("completed", "failed"):
        payload["finished_at"] = datetime.now(timezone.utc).isoformat()

    resp = (
        get_client()
        .table("sync_jobs")
        .update(payload)
        .eq("id", job_id)
        .maybe_single()
        .execute()
    )
    return resp.data
