"""
Substack subscriber forwarding via the public subscribe endpoint.

Substack has no official public API. This uses the same endpoint that
Substack's own signup form posts to. The subscriber receives a
confirmation email from Substack (double opt-in on their side).

Limitations:
- No programmatic unsubscribe (Substack doesn't expose this)
- No subscriber list export via API (must use Substack dashboard)
- Rate limits are undocumented — we throttle conservatively
"""

import logging
import os
import time

import httpx

from retry import retry_request

log = logging.getLogger(__name__)

SUBSTACK_PUBLICATION_URL = os.getenv("SUBSTACK_PUBLICATION_URL", "")
# e.g. "https://yourpub.substack.com" or custom domain

# Conservative rate limit: max 1 subscribe per second
_MIN_INTERVAL = 1.0
_last_request_time = 0.0


def _subscribe_url() -> str:
    """Build the Substack free subscribe endpoint URL."""
    base = SUBSTACK_PUBLICATION_URL.rstrip("/")
    return f"{base}/api/v1/free"


def _throttle():
    """Enforce minimum interval between Substack requests."""
    global _last_request_time
    now = time.monotonic()
    elapsed = now - _last_request_time
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_request_time = time.monotonic()


def subscribe(email: str) -> dict:
    """Subscribe an email to the Substack publication.

    Posts to Substack's free subscribe endpoint. The subscriber will
    receive a confirmation email from Substack.

    Returns:
        dict with keys:
        - success (bool): Whether the request succeeded
        - status_code (int): HTTP status from Substack
        - detail (str): Human-readable result
    """
    if not SUBSTACK_PUBLICATION_URL:
        log.error("SUBSTACK_PUBLICATION_URL not set")
        return {
            "success": False,
            "status_code": 0,
            "detail": "SUBSTACK_PUBLICATION_URL not configured",
        }

    _throttle()

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "etC2-Newsletter-Sync/1.0",
    }

    payload = {
        "email": email,
        "first_url": SUBSTACK_PUBLICATION_URL,
    }

    try:
        with httpx.Client(timeout=30) as client:
            resp = retry_request(
                client, "POST", _subscribe_url(),
                headers=headers, json=payload,
                max_retries=2,
            )

            if resp.status_code == 200:
                log.info("Substack subscribe sent for %s", email)
                return {
                    "success": True,
                    "status_code": 200,
                    "detail": "Confirmation email sent by Substack",
                }
            elif resp.status_code == 400:
                log.warning("Substack rejected %s: %s", email, resp.text[:200])
                return {
                    "success": False,
                    "status_code": 400,
                    "detail": f"Rejected: {resp.text[:200]}",
                }
            elif resp.status_code == 429:
                log.warning("Substack rate limited on subscribe for %s", email)
                return {
                    "success": False,
                    "status_code": 429,
                    "detail": "Rate limited by Substack, will retry",
                }
            else:
                log.warning(
                    "Substack subscribe unexpected %d for %s: %s",
                    resp.status_code, email, resp.text[:200],
                )
                return {
                    "success": False,
                    "status_code": resp.status_code,
                    "detail": f"Unexpected status: {resp.text[:200]}",
                }

    except httpx.HTTPError as e:
        log.error("Substack subscribe failed for %s: %s", email, e)
        return {
            "success": False,
            "status_code": 0,
            "detail": f"HTTP error: {str(e)[:200]}",
        }
