"""
Beehiiv API v2 client for subscriber management.

Handles subscriber CRUD, tag management, and webhook signature validation.
Docs: https://developers.beehiiv.com/docs/v2
"""

import hashlib
import hmac
import logging
import os
from typing import Any

import httpx

from retry import retry_request

log = logging.getLogger(__name__)

BASE_URL = "https://api.beehiiv.com/v2"

BEEHIIV_API_KEY = os.getenv("BEEHIIV_API_KEY", "")
BEEHIIV_PUBLICATION_ID = os.getenv("BEEHIIV_PUBLICATION_ID", "")
BEEHIIV_WEBHOOK_SECRET = os.getenv("BEEHIIV_WEBHOOK_SECRET", "")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {BEEHIIV_API_KEY}",
        "Content-Type": "application/json",
    }


def _pub_url(path: str = "") -> str:
    """Build URL scoped to our publication."""
    return f"{BASE_URL}/publications/{BEEHIIV_PUBLICATION_ID}{path}"


# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------


def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify Beehiiv webhook HMAC-SHA256 signature.

    Beehiiv sends the signature in the `X-Beehiiv-Signature` header.
    """
    if not BEEHIIV_WEBHOOK_SECRET:
        log.warning("BEEHIIV_WEBHOOK_SECRET not set, skipping verification")
        return True  # Allow in dev, block in prod via env check

    expected = hmac.new(
        BEEHIIV_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Subscriber operations
# ---------------------------------------------------------------------------


def list_subscribers(
    *,
    status: str | None = None,
    limit: int = 100,
    page: int | None = None,
) -> dict[str, Any]:
    """List subscribers with optional status filter.

    Status: active, inactive, validating, invalid, pending, unsubscribed
    """
    params: dict[str, Any] = {"limit": limit, "expand[]": "tags"}
    if status:
        params["status"] = status
    if page:
        params["page"] = page

    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "GET", _pub_url("/subscriptions"),
            headers=_headers(), params=params,
        )
        resp.raise_for_status()
        return resp.json()


def get_subscriber(subscriber_id: str) -> dict[str, Any]:
    """Fetch a single subscriber by Beehiiv ID."""
    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "GET", _pub_url(f"/subscriptions/{subscriber_id}"),
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json().get("data", {})


def get_subscriber_by_email(email: str) -> dict[str, Any] | None:
    """Look up a subscriber by email. Returns None if not found."""
    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "GET", _pub_url("/subscriptions"),
            headers=_headers(),
            params={"email": email, "limit": 1},
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return data[0] if data else None


def create_subscriber(
    email: str,
    *,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    referring_site: str | None = None,
    custom_fields: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Create a new subscriber in Beehiiv."""
    payload: dict[str, Any] = {
        "email": email,
        "reactivate_existing": False,
        "send_welcome_email": True,
    }
    if utm_source:
        payload["utm_source"] = utm_source
    if utm_medium:
        payload["utm_medium"] = utm_medium
    if utm_campaign:
        payload["utm_campaign"] = utm_campaign
    if referring_site:
        payload["referring_site"] = referring_site
    if custom_fields:
        payload["custom_fields"] = custom_fields

    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "POST", _pub_url("/subscriptions"),
            headers=_headers(), json=payload,
        )
        resp.raise_for_status()
        return resp.json().get("data", {})


def update_subscriber_tags(
    subscriber_id: str,
    *,
    add_tags: list[str] | None = None,
    remove_tags: list[str] | None = None,
) -> dict[str, Any]:
    """Add or remove tags from a subscriber."""
    payload: dict[str, Any] = {}
    if add_tags:
        payload["add_tags"] = add_tags
    if remove_tags:
        payload["remove_tags"] = remove_tags

    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "PATCH", _pub_url(f"/subscriptions/{subscriber_id}"),
            headers=_headers(), json=payload,
        )
        resp.raise_for_status()
        return resp.json().get("data", {})


def unsubscribe(subscriber_id: str) -> bool:
    """Unsubscribe a subscriber from Beehiiv."""
    with httpx.Client(timeout=30) as client:
        resp = retry_request(
            client, "DELETE", _pub_url(f"/subscriptions/{subscriber_id}"),
            headers=_headers(),
        )
        return resp.status_code in (200, 204)


def get_all_subscribers(status: str = "active") -> list[dict[str, Any]]:
    """Paginate through all subscribers with a given status.

    Used for reconciliation — fetches every subscriber.
    """
    all_subs: list[dict[str, Any]] = []
    page = 1

    while True:
        result = list_subscribers(status=status, limit=100, page=page)
        data = result.get("data", [])
        if not data:
            break
        all_subs.extend(data)
        # Check if there are more pages
        total_results = result.get("total_results", 0)
        if len(all_subs) >= total_results:
            break
        page += 1

    return all_subs
