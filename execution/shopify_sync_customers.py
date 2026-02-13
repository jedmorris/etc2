"""
Shopify Customer Sync Worker.
"""

from shopify_client import ShopifyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Shopify customers for user."""
    db = get_client()

    with ShopifyClient(user_id) as client:
        all_customers = []
        cursor = None

        while True:
            data = client.get_customers(cursor=cursor, first=50)
            edges = data.get("customers", {}).get("edges", [])
            page_info = data.get("customers", {}).get("pageInfo", {})

            for edge in edges:
                all_customers.append(edge["node"])
                cursor = edge["cursor"]

            if not page_info.get("hasNextPage"):
                break

    synced = 0
    for customer in all_customers:
        shopify_id = customer["id"].split("/")[-1]
        address = customer.get("defaultAddress") or {}
        total_spent = customer.get("totalSpentV2", {})

        customer_data = {
            "user_id": user_id,
            "email": customer.get("email"),
            "first_name": customer.get("firstName"),
            "last_name": customer.get("lastName"),
            "full_name": f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip(),
            "phone": customer.get("phone"),
            "city": address.get("city"),
            "state": address.get("provinceCode"),
            "country": address.get("countryCode"),
            "zip": address.get("zip"),
            "shopify_customer_id": shopify_id,
            "order_count": customer.get("ordersCount", 0),
            "total_spent_cents": int(float(total_spent.get("amount", "0")) * 100),
        }

        # Upsert: check if customer with same email exists
        existing = (
            db.table("customers")
            .select("id")
            .eq("user_id", user_id)
            .eq("shopify_customer_id", shopify_id)
            .execute()
        )

        if existing.data:
            db.table("customers").update(customer_data).eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("customers").insert(customer_data).execute()

        synced += 1

    return synced
