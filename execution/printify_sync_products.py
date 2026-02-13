"""
Printify Product Sync Worker.
"""

from printify_client import PrintifyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Printify products for user."""
    db = get_client()

    with PrintifyClient(user_id) as client:
        all_products = client.get_all_products()

    synced = 0
    for product in all_products:
        printify_id = product.get("id", "")

        # Calculate production costs from variants
        variants = product.get("variants", [])
        min_cost = min((v.get("cost", 0) for v in variants), default=0)

        # Try to link to existing product by title match
        product_data = {
            "user_id": user_id,
            "title": product.get("title", ""),
            "printify_product_id": printify_id,
            "printify_blueprint_id": str(product.get("blueprint_id", "")),
            "printify_provider_id": str(product.get("print_provider_id", "")),
            "printify_production_cost_cents": min_cost,
            "status": "active" if product.get("visible") else "draft",
            "image_url": (product.get("images", [{}])[0].get("src", "") if product.get("images") else ""),
            "tags": product.get("tags", []),
        }

        db.table("products").upsert(
            product_data,
            on_conflict="user_id,printify_product_id",
        ).execute()
        synced += 1

    return synced
