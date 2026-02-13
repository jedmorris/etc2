"""
Shopify Product Sync Worker.
"""

from shopify_client import ShopifyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Shopify products for user."""
    db = get_client()

    with ShopifyClient(user_id) as client:
        all_products = []
        shop_domain = client.shop_domain
        cursor = None

        while True:
            data = client.get_products(cursor=cursor, first=50)
            edges = data.get("products", {}).get("edges", [])
            page_info = data.get("products", {}).get("pageInfo", {})

            for edge in edges:
                all_products.append(edge["node"])
                cursor = edge["cursor"]

            if not page_info.get("hasNextPage"):
                break

    synced = 0
    for product in all_products:
        product_data = {
            "user_id": user_id,
            "title": product.get("title", ""),
            "shopify_product_id": product["id"].split("/")[-1],
            "shopify_url": f"https://{shop_domain}/products/{product.get('handle', '')}",
            "status": product.get("status", "active").lower(),
            "price_cents": int(float(product.get("priceRangeV2", {}).get("minVariantPrice", {}).get("amount", "0")) * 100),
            "currency": product.get("priceRangeV2", {}).get("minVariantPrice", {}).get("currencyCode", "USD"),
            "image_url": (product.get("featuredImage") or {}).get("url", ""),
            "tags": product.get("tags", []),
        }

        db.table("products").upsert(
            product_data,
            on_conflict="user_id,shopify_product_id",
        ).execute()
        synced += 1

    return synced
