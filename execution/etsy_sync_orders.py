"""
Etsy Order Sync Worker - syncs orders for a single user.
"""

from datetime import datetime
from etsy_client import EtsyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Etsy orders for user. Returns number of records processed."""
    db = get_client()

    # Get sync cursor (last sync timestamp)
    account = (
        db.table("connected_accounts")
        .select("sync_cursor")
        .eq("user_id", user_id)
        .eq("platform", "etsy")
        .maybe_single()
        .execute()
    )
    if not account.data:
        return 0
    cursor = account.data.get("sync_cursor", {}) or {}
    min_created = cursor.get("orders_last_ts")

    with EtsyClient(user_id) as client:
        receipts = client.get_all_receipts(min_created=min_created)

    synced = 0
    latest_ts = min_created

    for receipt in receipts:
        order_data = _map_receipt_to_order(user_id, receipt)

        result = db.table("orders").upsert(
            order_data,
            on_conflict="user_id,platform,platform_order_id",
        ).execute()

        # Get the order UUID for linking line items
        order_id = (result.data[0]["id"] if result.data else None)
        if not order_id:
            # Fallback: query by platform ID
            lookup = (
                db.table("orders")
                .select("id")
                .eq("user_id", user_id)
                .eq("platform", "etsy")
                .eq("platform_order_id", order_data["platform_order_id"])
                .maybe_single()
                .execute()
            )
            order_id = lookup.data["id"] if lookup.data else None

        # Sync line items (order_id is NOT NULL in schema, skip if missing)
        if order_id:
            transactions = receipt.get("transactions", [])
            for txn in transactions:
                line_item = _map_transaction_to_line_item(user_id, order_id, txn)
                db.table("order_line_items").upsert(
                    line_item,
                    on_conflict="user_id,order_id,platform_line_item_id",
                ).execute()

        # Track latest timestamp for cursor
        created_ts = receipt.get("create_timestamp")
        if created_ts and (not latest_ts or created_ts > latest_ts):
            latest_ts = created_ts

        synced += 1

    # Update cursor
    if latest_ts:
        db.table("connected_accounts").update({
            "sync_cursor": {**cursor, "orders_last_ts": latest_ts},
        }).eq("user_id", user_id).eq("platform", "etsy").execute()

    # Increment order count for billing
    if synced > 0:
        db.rpc("increment_order_count", {"p_user_id": user_id}).execute()

    return synced


def _map_receipt_to_order(user_id: str, receipt: dict) -> dict:
    """Map Etsy receipt to orders table row."""
    subtotal = receipt.get("subtotal", {})
    shipping = receipt.get("total_shipping_cost", {})
    tax = receipt.get("total_tax_cost", {})
    total = receipt.get("grandtotal", {})
    discount = receipt.get("discount_amt", {})

    return {
        "user_id": user_id,
        "platform": "etsy",
        "platform_order_id": str(receipt["receipt_id"]),
        "platform_order_number": str(receipt.get("receipt_id", "")),
        "status": receipt.get("status", "unknown"),
        "financial_status": "paid" if receipt.get("was_paid") else "pending",
        "fulfillment_status": "shipped" if receipt.get("was_shipped") else "unfulfilled",
        "subtotal_cents": _to_cents(subtotal),
        "shipping_cents": _to_cents(shipping),
        "tax_cents": _to_cents(tax),
        "discount_cents": _to_cents(discount),
        "total_cents": _to_cents(total),
        "currency": subtotal.get("currency_code", "USD"),
        "ordered_at": datetime.fromtimestamp(receipt.get("create_timestamp", 0)).isoformat(),
        "raw_data": receipt,
    }


def _map_transaction_to_line_item(user_id: str, order_id: str | None, txn: dict) -> dict:
    """Map Etsy transaction to order_line_items row."""
    price = txn.get("price", {})
    return {
        "user_id": user_id,
        "order_id": order_id,
        "platform_line_item_id": str(txn.get("transaction_id", "")),
        "title": txn.get("title", ""),
        "quantity": txn.get("quantity", 1),
        "unit_price_cents": _to_cents(price),
        "total_cents": _to_cents(price) * txn.get("quantity", 1),
        "sku": txn.get("sku", ""),
    }


def _to_cents(money: dict) -> int:
    """Convert Etsy money object to cents."""
    amount = money.get("amount", 0)
    divisor = money.get("divisor", 100)
    if divisor == 1:
        return int(amount * 100)
    return int(amount * 100 / divisor)
