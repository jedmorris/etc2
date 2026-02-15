"""
Printify Order Sync Worker.
Uses sync_cursor.printify_orders_last_ts to only fetch orders updated since last sync.
"""

import logging
import time
from datetime import datetime, timezone
from printify_client import PrintifyClient
import supabase_client as sb

log = logging.getLogger(__name__)

BATCH_SIZE = 25  # Pause every N inserts to avoid Supabase rate limits
SAVE_CURSOR_EVERY = 200  # Save progress periodically for crash recovery


def _load_cursor(db, user_id: str) -> dict:
    """Load the sync cursor from connected_accounts."""
    account = sb.get_connected_account(user_id, "printify")
    return (account or {}).get("sync_cursor") or {}


def _save_cursor(db, user_id: str, cursor: dict) -> None:
    """Persist the sync cursor back to connected_accounts."""
    db.table("connected_accounts").update({
        "sync_cursor": cursor,
    }).eq("user_id", user_id).eq("platform", "printify").execute()


def run(user_id: str) -> int:
    """Sync Printify orders for user. Uses cursor for incremental sync."""
    db = sb.get_client()
    cursor = _load_cursor(db, user_id)
    last_ts = cursor.get("printify_orders_last_ts")

    with PrintifyClient(user_id) as client:
        all_orders = client.get_all_orders()

    # Filter to only orders updated since last sync
    if last_ts:
        all_orders = [
            o for o in all_orders
            if (o.get("updated_at") or o.get("created_at", "")) > last_ts
        ]

    log.info("user=%s printify_orders: %d orders to sync (cursor=%s)", user_id, len(all_orders), last_ts)

    synced = 0
    newest_ts = last_ts
    for order in all_orders:
        # Track the newest timestamp we've seen
        order_ts = order.get("updated_at") or order.get("created_at", "")
        if order_ts and (not newest_ts or order_ts > newest_ts):
            newest_ts = order_ts
        printify_id = order.get("id", "")

        # Check if there's a matching Etsy/Shopify order to link
        external_id = order.get("external", {}).get("id", "")

        try:
            # Update existing order with Printify production costs
            if external_id:
                existing = (
                    db.table("orders")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("platform_order_id", external_id)
                    .execute()
                )
                if existing.data:
                    production_cost = sum(
                        item.get("cost", 0)
                        for item in order.get("line_items", [])
                    )
                    shipping_cost = order.get("total_shipping", 0)

                    db.table("orders").update({
                        "printify_order_id": printify_id,
                        "printify_production_cost_cents": production_cost,
                        "printify_shipping_cost_cents": shipping_cost,
                        "fulfillment_status": _map_printify_status(order.get("status", "")),
                    }).eq("id", existing.data[0]["id"]).execute()

                    synced += 1
                    continue

            # If no matching order, create a standalone Printify order record
            order_data = {
                "user_id": user_id,
                "platform": "printify",
                "platform_order_id": printify_id,
                "printify_order_id": printify_id,
                "status": order.get("status", "unknown"),
                "fulfillment_status": _map_printify_status(order.get("status", "")),
                "total_cents": order.get("total_price", 0),
                "printify_production_cost_cents": sum(
                    item.get("cost", 0) for item in order.get("line_items", [])
                ),
                "printify_shipping_cost_cents": order.get("total_shipping", 0),
                "ordered_at": order.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "raw_data": order,
            }

            db.table("orders").upsert(
                order_data,
                on_conflict="user_id,platform,platform_order_id",
            ).execute()
            synced += 1

        except Exception as e:
            log.warning("Failed to sync order %s: %s", printify_id, e)
            # Save cursor progress even on failure
            if newest_ts and newest_ts != last_ts:
                cursor["printify_orders_last_ts"] = newest_ts
                _save_cursor(db, user_id, cursor)
            continue

        # Brief pause every batch to avoid rate limits
        if synced % BATCH_SIZE == 0:
            time.sleep(0.3)

        # Save cursor periodically for crash recovery
        if synced % SAVE_CURSOR_EVERY == 0 and newest_ts and newest_ts != last_ts:
            cursor["printify_orders_last_ts"] = newest_ts
            _save_cursor(db, user_id, cursor)
            log.info("user=%s checkpoint: %d orders synced", user_id, synced)

    # Save cursor for next incremental sync
    if newest_ts and newest_ts != last_ts:
        cursor["printify_orders_last_ts"] = newest_ts
        _save_cursor(db, user_id, cursor)

    return synced


def _map_printify_status(status: str) -> str:
    """Map Printify order status to normalized fulfillment status."""
    mapping = {
        "pending": "unfulfilled",
        "sending-to-production": "in_production",
        "in-production": "in_production",
        "shipping": "shipped",
        "on-hold": "unfulfilled",
        "fulfilled": "delivered",
        "canceled": "cancelled",
    }
    return mapping.get(status, "unfulfilled")
