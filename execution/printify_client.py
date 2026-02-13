"""
Printify API v1 Client - Multi-tenant wrapper.
Loads per-user Personal Access Tokens.
"""

import httpx
from token_manager import load_tokens
from retry import retry_request
import supabase_client as sb

BASE_URL = "https://api.printify.com/v1"


class PrintifyClient:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.tokens = load_tokens(user_id, "printify")
        # Load shop_id from connected_accounts (platform_shop_id)
        account = sb.get_connected_account(user_id, "printify")
        self.shop_id = account.get("platform_shop_id", "") if account else ""
        self._client = httpx.Client(timeout=30)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.tokens['access_token']}",
        }

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make an authenticated request with retry on 429/5xx."""
        url = f"{BASE_URL}{path}"
        response = retry_request(
            self._client, method, url, headers=self._headers(), **kwargs,
        )
        response.raise_for_status()
        return response.json()

    def get_shops(self) -> list[dict]:
        """Get all shops."""
        return self._request("GET", "/shops.json")

    def get_orders(self, page: int = 1, limit: int = 50) -> dict:
        """Get orders for the shop."""
        params = {"page": page, "limit": limit}
        return self._request("GET", f"/shops/{self.shop_id}/orders.json", params=params)

    def get_order(self, order_id: str) -> dict:
        """Get a single order."""
        return self._request("GET", f"/shops/{self.shop_id}/orders/{order_id}.json")

    def get_products(self, page: int = 1, limit: int = 50) -> dict:
        """Get products for the shop."""
        params = {"page": page, "limit": limit}
        return self._request("GET", f"/shops/{self.shop_id}/products.json", params=params)

    def get_product(self, product_id: str) -> dict:
        """Get a single product."""
        return self._request("GET", f"/shops/{self.shop_id}/products/{product_id}.json")

    def get_all_orders(self) -> list[dict]:
        """Paginate through all orders."""
        all_orders = []
        page = 1

        while True:
            data = self.get_orders(page=page, limit=100)
            orders = data.get("data", [])
            all_orders.extend(orders)

            last_page = data.get("last_page", 1)
            if page >= last_page:
                break
            page += 1

        return all_orders

    def get_all_products(self) -> list[dict]:
        """Paginate through all products."""
        all_products = []
        page = 1

        while True:
            data = self.get_products(page=page, limit=100)
            products = data.get("data", [])
            all_products.extend(products)

            last_page = data.get("last_page", 1)
            if page >= last_page:
                break
            page += 1

        return all_products

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
