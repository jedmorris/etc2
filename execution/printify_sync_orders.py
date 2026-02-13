"""
Printify Order Sync Worker.
"""

from datetime import datetime, timezone
from printify_client import PrintifyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Printify orders for user."""
    db = get_client()

    with PrintifyClient(user_id) as client:
        all_orders = client.get_all_orders()

    synced = 0
    for order in all_orders:
        printify_id = order.get("id", "")

        # Check if there's a matching Etsy/Shopify order to link
        external_id = order.get("external", {}).get("id", "")

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
