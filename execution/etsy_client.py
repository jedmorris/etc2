"""
Etsy API v3 Client - Multi-tenant wrapper.
Loads per-user OAuth tokens, handles pagination, respects rate limits.
"""

import os
import httpx
from token_manager import load_tokens, refresh_etsy_token
from retry import retry_request
import rate_limiter
import supabase_client as sb

BASE_URL = "https://api.etsy.com/v3/application"


class EtsyClient:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.tokens = load_tokens(user_id, "etsy")
        # Load shop_id from connected_accounts (platform_shop_id)
        account = sb.get_connected_account(user_id, "etsy")
        self.shop_id = account.get("platform_shop_id") if account else None
        self._client = httpx.Client(timeout=30)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.tokens['access_token']}",
            "x-api-key": os.environ["ETSY_API_KEY"],
        }

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make an authenticated request with rate limiting, retry, and token refresh."""
        if not rate_limiter.can_make_request(self.user_id, "etsy"):
            raise RateLimitError("Etsy rate limit exceeded for user")

        url = f"{BASE_URL}{path}"
        response = retry_request(
            self._client, method, url, headers=self._headers(), **kwargs,
        )

        rate_limiter.record_request(self.user_id, "etsy", 1)

        if response.status_code == 401:
            # Token expired, refresh and retry once
            self.tokens = refresh_etsy_token(self.user_id)
            response = retry_request(
                self._client, method, url, headers=self._headers(), **kwargs,
            )
            rate_limiter.record_request(self.user_id, "etsy", 1)

        response.raise_for_status()
        return response.json()

    def get_shop(self) -> dict:
        """Get shop details."""
        return self._request("GET", f"/shops/{self.shop_id}")

    def get_receipts(self, min_created: int | None = None, limit: int = 25, offset: int = 0) -> dict:
        """Get shop receipts (orders)."""
        params: dict = {"limit": limit, "offset": offset}
        if min_created:
            params["min_created"] = min_created
        return self._request("GET", f"/shops/{self.shop_id}/receipts", params=params)

    def get_receipt(self, receipt_id: int) -> dict:
        """Get a single receipt."""
        return self._request("GET", f"/shops/{self.shop_id}/receipts/{receipt_id}")

    def get_receipt_transactions(self, receipt_id: int) -> dict:
        """Get transactions (line items) for a receipt."""
        return self._request("GET", f"/shops/{self.shop_id}/receipts/{receipt_id}/transactions")

    def get_listings(self, state: str = "active", limit: int = 25, offset: int = 0) -> dict:
        """Get shop listings."""
        params = {"state": state, "limit": limit, "offset": offset}
        return self._request("GET", f"/shops/{self.shop_id}/listings", params=params)

    def get_listing(self, listing_id: int) -> dict:
        """Get a single listing."""
        return self._request("GET", f"/listings/{listing_id}")

    def get_payments(self, min_created: int | None = None, limit: int = 25, offset: int = 0) -> dict:
        """Get shop payment ledger entries."""
        params: dict = {"limit": limit, "offset": offset}
        if min_created:
            params["min_created"] = min_created
        return self._request("GET", f"/shops/{self.shop_id}/payment-account/ledger-entries", params=params)

    def get_all_receipts(self, min_created: int | None = None) -> list[dict]:
        """Paginate through all receipts."""
        all_results = []
        offset = 0
        limit = 100

        while True:
            data = self.get_receipts(min_created=min_created, limit=limit, offset=offset)
            results = data.get("results", [])
            all_results.extend(results)

            if len(results) < limit:
                break
            offset += limit

        return all_results

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class RateLimitError(Exception):
    pass
