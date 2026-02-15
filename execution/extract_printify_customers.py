"""
Extract customers and order line items from Printify orders' raw_data JSON.

Printify sync writes orders and products but NOT customers or line items.
This script backfills both tables from the raw_data stored on each order.
"""

import logging
import time
from datetime import datetime, timezone
from supabase_client import get_client

log = logging.getLogger(__name__)

BATCH_SIZE = 500  # Orders to fetch per page
UPSERT_BATCH = 50  # Rows per upsert batch (avoid payload too large)


def run(user_id: str) -> dict:
    """Extract customers and line items from Printify orders.

    Returns dict with customers_created, line_items_created, errors.
    """
    db = get_client()
    customers_created = 0
    line_items_created = 0
    errors: list[str] = []

    # ── Phase 1: Build customer map from all Printify orders ──
    # Group orders by customer email to aggregate stats
    customer_map: dict[str, dict] = {}  # email -> aggregated data
    order_line_items: list[dict] = []  # (order_id, line_item_data) pairs
    product_lookup: dict[str, str] = {}  # printify_product_id -> products.id

    # Pre-load product lookup for line item matching
    try:
        offset = 0
        while True:
            prods = (
                db.table("products")
                .select("id, printify_product_id")
                .eq("user_id", user_id)
                .not_.is_("printify_product_id", "null")
                .range(offset, offset + 999)
                .execute()
            )
            for p in (prods.data or []):
                if p.get("printify_product_id"):
                    product_lookup[p["printify_product_id"]] = p["id"]
            if not prods.data or len(prods.data) < 1000:
                break
            offset += 1000
    except Exception as e:
        errors.append(f"Failed to load product lookup: {e}")
        log.error("user=%s %s", user_id, errors[-1])

    log.info("user=%s loaded %d products for line item matching", user_id, len(product_lookup))

    # Paginate through all Printify orders
    offset = 0
    total_orders = 0
    while True:
        try:
            result = (
                db.table("orders")
                .select("id, platform_order_id, raw_data, ordered_at, total_cents")
                .eq("user_id", user_id)
                .eq("platform", "printify")
                .not_.is_("raw_data", "null")
                .order("ordered_at", desc=False)
                .range(offset, offset + BATCH_SIZE - 1)
                .execute()
            )
        except Exception as e:
            errors.append(f"Failed to fetch orders at offset {offset}: {e}")
            log.error("user=%s %s", user_id, errors[-1])
            break

        rows = result.data or []
        if not rows:
            break

        for order in rows:
            raw = order.get("raw_data")
            if not raw or not isinstance(raw, dict):
                continue

            order_id = order["id"]
            ordered_at = order.get("ordered_at")
            total_cents = order.get("total_cents", 0)

            # ── Extract customer from address_to ──
            addr = raw.get("address_to") or {}
            email = (addr.get("email") or "").strip().lower()
            first_name = (addr.get("first_name") or "").strip()
            last_name = (addr.get("last_name") or "").strip()

            if email:
                if email not in customer_map:
                    customer_map[email] = {
                        "email": email,
                        "first_name": first_name,
                        "last_name": last_name,
                        "full_name": f"{first_name} {last_name}".strip() or None,
                        "city": (addr.get("city") or "").strip() or None,
                        "state": (addr.get("region") or "").strip() or None,
                        "country": (addr.get("country") or "").strip() or None,
                        "zip": (addr.get("zip") or "").strip() or None,
                        "order_count": 0,
                        "total_spent_cents": 0,
                        "first_order_at": ordered_at,
                        "last_order_at": ordered_at,
                    }
                cust = customer_map[email]
                cust["order_count"] += 1
                cust["total_spent_cents"] += total_cents or 0
                if ordered_at:
                    if not cust["first_order_at"] or ordered_at < cust["first_order_at"]:
                        cust["first_order_at"] = ordered_at
                    if not cust["last_order_at"] or ordered_at > cust["last_order_at"]:
                        cust["last_order_at"] = ordered_at

            # ── Extract line items ──
            raw_line_items = raw.get("line_items") or []
            for idx, li in enumerate(raw_line_items):
                printify_product_id = str(li.get("product_id", "")) if li.get("product_id") else None
                product_db_id = product_lookup.get(printify_product_id) if printify_product_id else None

                # Build a stable platform_line_item_id
                li_id = li.get("id") or f"{order['platform_order_id']}-{idx}"

                quantity = li.get("quantity", 1)
                # Printify stores cost in cents in metadata, price varies
                cost_cents = li.get("cost", 0) or 0
                # Use shipping cost from metadata if available
                price_cents = li.get("price", 0) or 0
                total_li_cents = price_cents * quantity if price_cents else 0

                title = (li.get("title") or "Unknown item")[:500]
                sku = (li.get("sku") or li.get("variant_label") or "")[:200] or None
                variant_title = (li.get("variant_label") or "")[:200] or None

                order_line_items.append({
                    "user_id": user_id,
                    "order_id": order_id,
                    "product_id": product_db_id,
                    "title": title,
                    "quantity": quantity,
                    "unit_price_cents": price_cents,
                    "total_cents": total_li_cents,
                    "sku": sku,
                    "variant_title": variant_title,
                    "platform_line_item_id": str(li_id),
                })

        total_orders += len(rows)
        offset += BATCH_SIZE

        # Rate limit: sleep every 2000 orders
        if total_orders % 2000 == 0:
            time.sleep(1)

        if len(rows) < BATCH_SIZE:
            break

    log.info("user=%s scanned %d orders, found %d unique customers, %d line items",
             user_id, total_orders, len(customer_map), len(order_line_items))

    # ── Phase 2: Upsert customers ──
    for email, cust in customer_map.items():
        avg_order = (
            cust["total_spent_cents"] // cust["order_count"]
            if cust["order_count"] > 0
            else 0
        )

        try:
            # Check if customer already exists by email
            existing_resp = (
                db.table("customers")
                .select("id, order_count, total_spent_cents, first_name, last_name")
                .eq("user_id", user_id)
                .eq("email", email)
                .limit(1)
                .execute()
            )
            existing = existing_resp.data[0] if existing_resp.data else None

            if existing:
                # Update existing customer
                db.table("customers").update({
                    "first_name": cust["first_name"] or existing.get("first_name"),
                    "last_name": cust["last_name"] or existing.get("last_name"),
                    "full_name": cust["full_name"],
                    "city": cust["city"],
                    "state": cust["state"],
                    "country": cust["country"],
                    "zip": cust["zip"],
                    "printify_customer_id": email,  # Use email as Printify customer ID
                    "order_count": cust["order_count"],
                    "total_spent_cents": cust["total_spent_cents"],
                    "average_order_cents": avg_order,
                    "first_order_at": cust["first_order_at"],
                    "last_order_at": cust["last_order_at"],
                }).eq("id", existing["id"]).execute()
            else:
                # Insert new customer
                db.table("customers").insert({
                    "user_id": user_id,
                    "email": email,
                    "first_name": cust["first_name"],
                    "last_name": cust["last_name"],
                    "full_name": cust["full_name"],
                    "city": cust["city"],
                    "state": cust["state"],
                    "country": cust["country"],
                    "zip": cust["zip"],
                    "printify_customer_id": email,
                    "order_count": cust["order_count"],
                    "total_spent_cents": cust["total_spent_cents"],
                    "average_order_cents": avg_order,
                    "first_order_at": cust["first_order_at"],
                    "last_order_at": cust["last_order_at"],
                }).execute()
                customers_created += 1
        except Exception as e:
            errors.append(f"Failed to upsert customer {email}: {e}")
            log.error("user=%s %s", user_id, errors[-1])

        # Rate limit
        if customers_created % 100 == 0 and customers_created > 0:
            time.sleep(0.5)

    log.info("user=%s upserted %d customers (total unique: %d)",
             user_id, customers_created, len(customer_map))

    # ── Phase 3: Link orders to customers ──
    # Build email -> customer_id map
    try:
        cust_rows = (
            db.table("customers")
            .select("id, email")
            .eq("user_id", user_id)
            .not_.is_("email", "null")
            .execute()
        )
        email_to_cust_id = {
            r["email"].lower(): r["id"]
            for r in (cust_rows.data or [])
            if r.get("email")
        }
    except Exception as e:
        email_to_cust_id = {}
        errors.append(f"Failed to build customer ID map: {e}")

    # Update orders that don't have customer_id set
    if email_to_cust_id:
        offset = 0
        linked = 0
        while True:
            try:
                unlinked = (
                    db.table("orders")
                    .select("id, raw_data")
                    .eq("user_id", user_id)
                    .eq("platform", "printify")
                    .is_("customer_id", "null")
                    .not_.is_("raw_data", "null")
                    .range(offset, offset + BATCH_SIZE - 1)
                    .execute()
                )
            except Exception as e:
                errors.append(f"Failed to fetch unlinked orders at offset {offset}: {e}")
                break

            rows = unlinked.data or []
            if not rows:
                break

            for order in rows:
                raw = order.get("raw_data") or {}
                addr = raw.get("address_to") or {}
                email = (addr.get("email") or "").strip().lower()
                cust_id = email_to_cust_id.get(email)
                if cust_id:
                    try:
                        db.table("orders").update({"customer_id": cust_id}).eq("id", order["id"]).execute()
                        linked += 1
                    except Exception as e:
                        log.error("Failed to link order %s to customer: %s", order["id"], e)

            offset += BATCH_SIZE
            if len(rows) < BATCH_SIZE:
                break
            if linked % 500 == 0 and linked > 0:
                time.sleep(0.5)

        log.info("user=%s linked %d orders to customers", user_id, linked)

    # ── Phase 4: Upsert line items ──
    for i in range(0, len(order_line_items), UPSERT_BATCH):
        batch = order_line_items[i:i + UPSERT_BATCH]
        try:
            db.table("order_line_items").upsert(
                batch,
                on_conflict="user_id,order_id,platform_line_item_id"
            ).execute()
            line_items_created += len(batch)
        except Exception as e:
            errors.append(f"Failed to upsert line items batch at {i}: {e}")
            log.error("user=%s %s", user_id, errors[-1])

        if i % 500 == 0 and i > 0:
            time.sleep(0.5)

    log.info("user=%s upserted %d line items", user_id, line_items_created)

    return {
        "status": "complete" if not errors else "partial",
        "customers_created": customers_created,
        "total_customers": len(customer_map),
        "line_items_created": line_items_created,
        "orders_scanned": total_orders,
        "errors": errors[:20],  # Cap error list
    }


if __name__ == "__main__":
    import sys
    from log_config import setup_logging
    setup_logging()

    uid = sys.argv[1] if len(sys.argv) > 1 else None
    if not uid:
        print("Usage: python extract_printify_customers.py <user_id>")
        sys.exit(1)

    result = run(uid)
    print(f"\nResults: {result}")
