"""
Shopify Order Sync Worker - syncs orders for a single user via GraphQL.
"""

from shopify_client import ShopifyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Shopify orders for user. Returns number of records processed."""
    db = get_client()

    account = (
        db.table("connected_accounts")
        .select("sync_cursor")
        .eq("user_id", user_id)
        .eq("platform", "shopify")
        .maybe_single()
        .execute()
    )
    if not account.data:
        return 0
    cursor_data = account.data.get("sync_cursor", {}) or {}
    last_cursor = cursor_data.get("orders_cursor")

    with ShopifyClient(user_id) as client:
        all_orders = []
        cursor = last_cursor

        while True:
            data = client.get_orders(cursor=cursor, first=50)
            edges = data.get("orders", {}).get("edges", [])
            page_info = data.get("orders", {}).get("pageInfo", {})

            for edge in edges:
                all_orders.append(edge["node"])
                cursor = edge["cursor"]

            if not page_info.get("hasNextPage"):
                break

    synced = 0
    for order in all_orders:
        order_data = _map_order(user_id, order)
        result = db.table("orders").upsert(
            order_data,
            on_conflict="user_id,platform,platform_order_id",
        ).execute()

        # Get the order UUID for linking line items
        order_id = (result.data[0]["id"] if result.data else None)
        if not order_id:
            lookup = (
                db.table("orders")
                .select("id")
                .eq("user_id", user_id)
                .eq("platform", "shopify")
                .eq("platform_order_id", order_data["platform_order_id"])
                .maybe_single()
                .execute()
            )
            order_id = lookup.data["id"] if lookup.data else None

        # Sync line items (order_id is NOT NULL in schema, skip if missing)
        if order_id:
            for edge in order.get("lineItems", {}).get("edges", []):
                item = edge["node"]
                line_data = {
                    "user_id": user_id,
                    "order_id": order_id,
                    "title": item.get("title", ""),
                    "quantity": item.get("quantity", 1),
                    "unit_price_cents": _money_to_cents(item.get("originalUnitPriceSet", {}).get("shopMoney", {})),
                    "total_cents": _money_to_cents(item.get("originalUnitPriceSet", {}).get("shopMoney", {})) * item.get("quantity", 1),
                    "sku": item.get("sku", ""),
                    "variant_title": (item.get("variant") or {}).get("title", ""),
                    "platform_line_item_id": item.get("id", ""),
                }
                db.table("order_line_items").upsert(
                    line_data,
                    on_conflict="user_id,order_id,platform_line_item_id",
                ).execute()

        synced += 1

    # Update cursor
    if cursor:
        db.table("connected_accounts").update({
            "sync_cursor": {**cursor_data, "orders_cursor": cursor},
        }).eq("user_id", user_id).eq("platform", "shopify").execute()

    if synced > 0:
        db.rpc("increment_order_count", {"p_user_id": user_id}).execute()

    return synced


def _map_order(user_id: str, order: dict) -> dict:
    """Map Shopify order to orders table row."""
    return {
        "user_id": user_id,
        "platform": "shopify",
        "platform_order_id": order["id"].split("/")[-1],
        "platform_order_number": order.get("name", ""),
        "status": "open",
        "financial_status": (order.get("displayFinancialStatus") or "").lower(),
        "fulfillment_status": (order.get("displayFulfillmentStatus") or "unfulfilled").lower(),
        "subtotal_cents": _money_to_cents(order.get("subtotalPriceSet", {}).get("shopMoney", {})),
        "shipping_cents": _money_to_cents(order.get("totalShippingPriceSet", {}).get("shopMoney", {})),
        "tax_cents": _money_to_cents(order.get("totalTaxSet", {}).get("shopMoney", {})),
        "discount_cents": _money_to_cents(order.get("totalDiscountsSet", {}).get("shopMoney", {})),
        "total_cents": _money_to_cents(order.get("totalPriceSet", {}).get("shopMoney", {})),
        "currency": order.get("totalPriceSet", {}).get("shopMoney", {}).get("currencyCode", "USD"),
        "ordered_at": order.get("createdAt", ""),
        "raw_data": order,
    }


def _money_to_cents(money: dict) -> int:
    """Convert Shopify money to cents."""
    amount = money.get("amount", "0")
    return int(float(amount) * 100)
