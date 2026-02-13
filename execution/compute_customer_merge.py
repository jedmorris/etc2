"""
Cross-Platform Customer Merge for a single user.
Deduplicates customer records across Etsy, Shopify, and Printify.
"""

import logging
from supabase_client import get_client

log = logging.getLogger(__name__)


def run(user_id: str) -> int:
    """Merge customer records. Returns number of merges performed."""
    db = get_client()

    # Get all customers for this user
    try:
        result = (
            db.table("customers")
            .select("id, email, first_name, last_name, full_name, "
                    "etsy_customer_id, shopify_customer_id, printify_customer_id, "
                    "order_count, total_spent_cents")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        log.error("Failed to fetch customers user=%s: %s", user_id, e)
        return 0

    customers = result.data or []
    if not customers:
        return 0

    # Group by email (primary match key)
    by_email: dict[str, list[dict]] = {}

    for c in customers:
        email = (c.get("email") or "").lower().strip()
        if email:
            by_email.setdefault(email, []).append(c)

    merges = 0

    for email, group in by_email.items():
        if len(group) < 2:
            continue

        # Pick the primary record (most orders, or first created)
        primary = max(group, key=lambda c: c.get("order_count", 0))
        others = [c for c in group if c["id"] != primary["id"]]

        # Merge platform IDs and totals into primary
        update: dict = {}
        total_order_count = primary.get("order_count", 0)
        total_spent = primary.get("total_spent_cents", 0)

        for other in others:
            if other.get("etsy_customer_id") and not primary.get("etsy_customer_id"):
                update["etsy_customer_id"] = other["etsy_customer_id"]
            if other.get("shopify_customer_id") and not primary.get("shopify_customer_id"):
                update["shopify_customer_id"] = other["shopify_customer_id"]
            if other.get("printify_customer_id") and not primary.get("printify_customer_id"):
                update["printify_customer_id"] = other["printify_customer_id"]

            # Accumulate totals from others
            total_order_count += other.get("order_count", 0)
            total_spent += other.get("total_spent_cents", 0)

            # Fill in name if missing on primary
            if not primary.get("full_name") and other.get("full_name"):
                update["full_name"] = other["full_name"]
                update["first_name"] = other.get("first_name")
                update["last_name"] = other.get("last_name")

        update["order_count"] = total_order_count
        update["total_spent_cents"] = total_spent

        if update:
            try:
                db.table("customers").update(update).eq("id", primary["id"]).execute()
            except Exception as e:
                log.error("Failed to update primary customer=%s user=%s: %s", primary["id"], user_id, e)
                continue  # Skip this group if primary update fails

        # Re-point orders from merged records to primary, then delete duplicates
        for other in others:
            try:
                db.table("orders").update({
                    "customer_id": primary["id"],
                }).eq("user_id", user_id).eq("customer_id", other["id"]).execute()
            except Exception as e:
                log.error("Failed to re-point orders from customer=%s to %s: %s", other["id"], primary["id"], e)
                continue  # Don't delete if order re-point failed

            try:
                db.table("customers").delete().eq("id", other["id"]).execute()
                merges += 1
            except Exception as e:
                log.error("Failed to delete merged customer=%s: %s", other["id"], e)

    return merges
