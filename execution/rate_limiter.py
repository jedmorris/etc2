"""
Per-user, per-platform rate-limit tracker for etC2 sync workers.

Why this matters
----------------
Etsy's v3 API enforces a **shared** 10 000 queries-per-day (QPD) budget
across *all* users of a single API key.  If one tenant burns the budget,
every other tenant is blocked until midnight UTC.

This module keeps an in-memory ledger (dict) of calls made today, with
periodic flush to Supabase so that multiple workers / restarts stay
roughly in sync.  It is intentionally simple -- no Redis dependency.

Budget allocation
-----------------
Each active user gets::

    per_user_budget = (global_budget / active_user_count) * 0.8

The 0.8 safety factor leaves a 20 % reserve for retries and spikes.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

import supabase_client as sb

# ---------------------------------------------------------------------------
# Platform budget configuration
# ---------------------------------------------------------------------------

PLATFORM_BUDGETS: dict[str, int] = {
    "etsy": 10_000,     # Etsy v3 shared QPD
    "shopify": 80,      # Shopify REST bucket (per-store, refills 2/s)
}

# Safety factor applied when dividing the global budget among users.
SAFETY_FACTOR: float = 0.8

# ---------------------------------------------------------------------------
# In-memory state (thread-safe via lock)
# ---------------------------------------------------------------------------

_lock = threading.Lock()

# _daily_usage[("2025-06-15", "etsy", "user-abc")] = 42
_daily_usage: dict[tuple[str, str, str], int] = defaultdict(int)

# _global_usage[("2025-06-15", "etsy")] = 3400
_global_usage: dict[tuple[str, str], int] = defaultdict(int)

# Number of active users per platform (refreshed periodically).
_active_users: dict[str, int] = defaultdict(lambda: 1)

# Track last flush so we can do it periodically.
_last_flush: datetime | None = None

# How many seconds between Supabase flushes.
FLUSH_INTERVAL_SECONDS: int = 60


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _today() -> str:
    """Return today's date string in UTC (YYYY-MM-DD)."""
    return date.today().isoformat()


def _reset_if_new_day() -> None:
    """Clear in-memory counters if the UTC date has rolled over."""
    today = _today()
    # Check if any key belongs to a previous day.  If the dict is empty
    # there is nothing to reset.
    if _daily_usage:
        sample_key = next(iter(_daily_usage))
        if sample_key[0] != today:
            _daily_usage.clear()
            _global_usage.clear()


def _per_user_budget(platform: str) -> int:
    """Compute the per-user budget for *platform* right now."""
    global_budget = PLATFORM_BUDGETS.get(platform, 10_000)
    user_count = max(_active_users.get(platform, 1), 1)
    return int((global_budget / user_count) * SAFETY_FACTOR)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def refresh_active_user_counts() -> None:
    """Query Supabase to update the count of users with a connected
    account per platform.  Call this once at worker startup and
    periodically (e.g. every 5 minutes).
    """
    try:
        resp = (
            sb.get_client()
            .table("connected_accounts")
            .select("platform", count="exact")
            .execute()
        )
        # Group by platform.
        counts: dict[str, int] = defaultdict(int)
        for row in resp.data or []:
            counts[row["platform"]] += 1
        with _lock:
            for platform, count in counts.items():
                _active_users[platform] = max(count, 1)
    except Exception:
        # Non-fatal -- keep using the last-known counts.
        pass


def can_make_request(user_id: str, platform: str) -> bool:
    """Return True if ``user_id`` is allowed to make another API call
    to ``platform`` without exceeding their budget *or* the global cap.
    """
    today = _today()
    global_budget = PLATFORM_BUDGETS.get(platform, 10_000)

    with _lock:
        _reset_if_new_day()
        user_used = _daily_usage[(today, platform, user_id)]
        global_used = _global_usage[(today, platform)]

    # Global hard ceiling.
    if global_used >= global_budget:
        return False

    # Per-user soft ceiling.
    if user_used >= _per_user_budget(platform):
        return False

    return True


def record_request(
    user_id: str, platform: str, count: int = 1
) -> None:
    """Record that ``count`` API calls were made by ``user_id``."""
    today = _today()
    with _lock:
        _reset_if_new_day()
        _daily_usage[(today, platform, user_id)] += count
        _global_usage[(today, platform)] += count


def get_remaining_budget(user_id: str, platform: str) -> int:
    """Return how many more calls ``user_id`` can make today."""
    today = _today()
    with _lock:
        _reset_if_new_day()
        user_used = _daily_usage[(today, platform, user_id)]
    budget = _per_user_budget(platform)
    return max(budget - user_used, 0)


def get_global_usage(platform: str) -> dict[str, Any]:
    """Return a snapshot of global usage for ``platform`` today."""
    today = _today()
    global_budget = PLATFORM_BUDGETS.get(platform, 10_000)
    with _lock:
        _reset_if_new_day()
        used = _global_usage[(today, platform)]
    return {
        "platform": platform,
        "date": today,
        "used": used,
        "budget": global_budget,
        "remaining": max(global_budget - used, 0),
        "active_users": _active_users.get(platform, 1),
        "per_user_budget": _per_user_budget(platform),
    }


# ---------------------------------------------------------------------------
# Flush to Supabase (optional persistence)
# ---------------------------------------------------------------------------


def flush_to_supabase(force: bool = False) -> None:
    """Persist the current in-memory counters to a
    ``rate_limit_tracking`` table in Supabase.

    Skips the write if less than ``FLUSH_INTERVAL_SECONDS`` have
    elapsed since the last flush, unless ``force=True``.

    The table schema is assumed to be::

        rate_limit_tracking (
            id           uuid primary key default gen_random_uuid(),
            date         date not null,
            platform     text not null,
            user_id      uuid not null,
            request_count int  not null default 0,
            updated_at   timestamptz default now(),
            unique(date, platform, user_id)
        )
    """
    global _last_flush

    now = datetime.now(timezone.utc)
    if not force and _last_flush is not None:
        elapsed = (now - _last_flush).total_seconds()
        if elapsed < FLUSH_INTERVAL_SECONDS:
            return

    with _lock:
        snapshot = dict(_daily_usage)

    rows = [
        {
            "date": key[0],
            "platform": key[1],
            "user_id": key[2],
            "request_count": count,
            "updated_at": now.isoformat(),
        }
        for key, count in snapshot.items()
    ]

    if not rows:
        _last_flush = now
        return

    try:
        (
            sb.get_client()
            .table("rate_limit_tracking")
            .upsert(rows, on_conflict="date,platform,user_id")
            .execute()
        )
        _last_flush = now
    except Exception:
        # Non-fatal -- we still have the in-memory copy.
        pass


def load_from_supabase() -> None:
    """Seed the in-memory counters from Supabase on worker startup.

    This means a worker restart mid-day will not lose awareness of
    calls already made.
    """
    today = _today()
    try:
        resp = (
            sb.get_client()
            .table("rate_limit_tracking")
            .select("*")
            .eq("date", today)
            .execute()
        )
        with _lock:
            for row in resp.data or []:
                key = (row["date"], row["platform"], row["user_id"])
                _daily_usage[key] = row["request_count"]
                _global_usage[(row["date"], row["platform"])] += row[
                    "request_count"
                ]
    except Exception:
        # Non-fatal -- start from zero.
        pass
