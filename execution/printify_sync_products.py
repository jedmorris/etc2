"""
Printify Product Sync Worker.
Uses sync_cursor.printify_products_last_ts for incremental sync.
"""

import logging
import time
from printify_client import PrintifyClient
import supabase_client as sb

log = logging.getLogger(__name__)

BATCH_SIZE = 25  # Upsert in batches to avoid rate limits


def run(user_id: str) -> int:
    """Sync Printify products for user."""
    db = sb.get_client()

    # Load cursor
    account = sb.get_connected_account(user_id, "printify")
    cursor = (account or {}).get("sync_cursor") or {}
    last_ts = cursor.get("printify_products_last_ts")

    with PrintifyClient(user_id) as client:
        all_products = client.get_all_products()

    # Filter to only products updated since last sync
    if last_ts:
        all_products = [
            p for p in all_products
            if (p.get("updated_at") or p.get("created_at", "")) > last_ts
        ]

    log.info("user=%s printify_products: %d products to sync (cursor=%s)", user_id, len(all_products), last_ts)

    synced = 0
    newest_ts = last_ts
    batch = []

    for product in all_products:
        product_ts = product.get("updated_at") or product.get("created_at", "")
        if product_ts and (not newest_ts or product_ts > newest_ts):
            newest_ts = product_ts
        printify_id = product.get("id", "")

        # Calculate production costs from variants
        variants = product.get("variants", [])
        min_cost = min((v.get("cost", 0) for v in variants), default=0)

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

        # Check if product exists, then update or insert
        existing_resp = (
            db.table("products")
            .select("id")
            .eq("user_id", user_id)
            .eq("printify_product_id", printify_id)
            .maybe_single()
            .execute()
        )

        try:
            if existing_resp and existing_resp.data:
                # Update existing
                db.table("products").update(product_data).eq("id", existing_resp.data["id"]).execute()
            else:
                # Insert new
                db.table("products").insert(product_data).execute()
            synced += 1
        except Exception as e:
            log.warning("Failed to sync product %s: %s", printify_id, e)
            continue

        # Brief pause every batch to avoid rate limits
        if synced % BATCH_SIZE == 0:
            time.sleep(0.2)

    # Save cursor for next incremental sync
    if newest_ts and newest_ts != last_ts:
        cursor["printify_products_last_ts"] = newest_ts
        db.table("connected_accounts").update({
            "sync_cursor": cursor,
        }).eq("user_id", user_id).eq("platform", "printify").execute()

    return synced
