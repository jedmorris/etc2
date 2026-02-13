"""
Retry decorator with exponential backoff for HTTP requests.
Handles 429 (rate limited) and 5xx (server error) responses.
"""

import logging
import time
import httpx

log = logging.getLogger(__name__)

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
DEFAULT_MAX_RETRIES = 3
DEFAULT_BASE_DELAY = 1.0  # seconds
DEFAULT_MAX_DELAY = 60.0  # seconds


def retry_request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    **kwargs,
) -> httpx.Response:
    """
    Make an HTTP request with exponential backoff retry on 429/5xx.

    Honors Retry-After header when present.
    """
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            response = client.request(method, url, **kwargs)

            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response

            # Retryable status — calculate delay
            if attempt >= max_retries:
                return response  # Return last response, let caller handle

            delay = _calculate_delay(response, attempt, base_delay, max_delay)
            log.warning(
                "Retryable %d from %s %s (attempt %d/%d), retrying in %.1fs",
                response.status_code, method, url, attempt + 1, max_retries, delay,
            )
            time.sleep(delay)

        except httpx.TimeoutException as e:
            last_exc = e
            if attempt >= max_retries:
                raise
            delay = min(base_delay * (2 ** attempt), max_delay)
            log.warning(
                "Timeout on %s %s (attempt %d/%d), retrying in %.1fs",
                method, url, attempt + 1, max_retries, delay,
            )
            time.sleep(delay)

        except httpx.ConnectError as e:
            last_exc = e
            if attempt >= max_retries:
                raise
            delay = min(base_delay * (2 ** attempt), max_delay)
            log.warning(
                "Connection error on %s %s (attempt %d/%d), retrying in %.1fs",
                method, url, attempt + 1, max_retries, delay,
            )
            time.sleep(delay)

    # Should never reach here, but just in case
    if last_exc:
        raise last_exc
    raise RuntimeError("Retry loop exited unexpectedly")


def _calculate_delay(
    response: httpx.Response,
    attempt: int,
    base_delay: float,
    max_delay: float,
) -> float:
    """Calculate delay, honoring Retry-After header if present."""
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return min(float(retry_after), max_delay)
        except ValueError:
            pass

    # Exponential backoff: 1s, 2s, 4s, 8s...
    return min(base_delay * (2 ** attempt), max_delay)
