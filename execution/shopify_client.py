"""
Shopify GraphQL Client - Multi-tenant wrapper.
Loads per-user tokens, uses GraphQL Admin API.
"""

import httpx
from token_manager import load_tokens
from retry import retry_request

GRAPHQL_API_VERSION = "2024-10"


class ShopifyClient:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.tokens = load_tokens(user_id, "shopify")
        self.shop_domain = self.tokens.get("shop_id", "")
        self.base_url = f"https://{self.shop_domain}/admin/api/{GRAPHQL_API_VERSION}"
        self._client = httpx.Client(timeout=30)

    def _headers(self) -> dict:
        return {
            "X-Shopify-Access-Token": self.tokens["access_token"],
            "Content-Type": "application/json",
        }

    def graphql(self, query: str, variables: dict | None = None) -> dict:
        """Execute a GraphQL query with retry on 429/5xx."""
        payload: dict = {"query": query}
        if variables:
            payload["variables"] = variables

        response = retry_request(
            self._client, "POST",
            f"{self.base_url}/graphql.json",
            headers=self._headers(),
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            raise ShopifyAPIError(data["errors"])

        return data.get("data", {})

    def get_orders(self, cursor: str | None = None, first: int = 50) -> dict:
        """Get orders with pagination."""
        query = """
        query GetOrders($first: Int!, $after: String) {
          orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                email
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                subtotalPriceSet { shopMoney { amount currencyCode } }
                totalShippingPriceSet { shopMoney { amount currencyCode } }
                totalTaxSet { shopMoney { amount currencyCode } }
                totalDiscountsSet { shopMoney { amount currencyCode } }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPriceSet { shopMoney { amount currencyCode } }
                      sku
                      variant { title }
                    }
                  }
                }
                shippingAddress { city provinceCode countryCode zip }
                customer { id email firstName lastName }
                fulfillments { trackingInfo { number url company } createdAt }
              }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        """
        variables = {"first": first}
        if cursor:
            variables["after"] = cursor
        return self.graphql(query, variables)

    def get_products(self, cursor: str | None = None, first: int = 50) -> dict:
        """Get products with pagination."""
        query = """
        query GetProducts($first: Int!, $after: String) {
          products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
            edges {
              node {
                id
                title
                handle
                status
                totalInventory
                priceRangeV2 { minVariantPrice { amount currencyCode } }
                featuredImage { url altText }
                tags
                createdAt
                updatedAt
              }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        """
        variables = {"first": first}
        if cursor:
            variables["after"] = cursor
        return self.graphql(query, variables)

    def get_customers(self, cursor: str | None = None, first: int = 50) -> dict:
        """Get customers with pagination."""
        query = """
        query GetCustomers($first: Int!, $after: String) {
          customers(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                ordersCount
                totalSpentV2 { amount currencyCode }
                defaultAddress { city provinceCode countryCode zip }
                createdAt
                updatedAt
              }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }
        """
        variables = {"first": first}
        if cursor:
            variables["after"] = cursor
        return self.graphql(query, variables)

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class ShopifyAPIError(Exception):
    pass
