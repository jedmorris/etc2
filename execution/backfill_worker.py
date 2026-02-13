"""
Backfill Worker - full historical data load for a single user.
Triggered after onboarding completes.
"""

from supabase_client import get_client


def run(user_id: str) -> int:
    """Run full backfill for a user. Returns total records processed."""
    db = get_client()
    total = 0

    # Determine which platforms are connected
    accounts = (
        db.table("connected_accounts")
        .select("platform, status")
        .eq("user_id", user_id)
        .eq("status", "connected")
        .execute()
    )

    platforms = [a["platform"] for a in (accounts.data or [])]

    # Run sync for each platform (orders first, then supplementary data)
    for platform in platforms:
        try:
            if platform == "etsy":
                from etsy_sync_orders import run as sync_orders
                from etsy_sync_listings import run as sync_listings
                from etsy_sync_payments import run as sync_payments

                total += sync_orders(user_id)
                total += sync_listings(user_id)
                total += sync_payments(user_id)

            elif platform == "shopify":
                from shopify_sync_orders import run as sync_orders
                from shopify_sync_products import run as sync_products
                from shopify_sync_customers import run as sync_customers

                total += sync_orders(user_id)
                total += sync_products(user_id)
                total += sync_customers(user_id)

            elif platform == "printify":
                from printify_sync_orders import run as sync_orders
                from printify_sync_products import run as sync_products

                total += sync_orders(user_id)
                total += sync_products(user_id)

        except Exception as e:
            # Log error but continue with other platforms
            db.table("sync_log").insert({
                "user_id": user_id,
                "platform": platform,
                "sync_type": "backfill",
                "status": "failed",
                "error_message": str(e)[:500],
            }).execute()

    # Log completion
    db.table("sync_log").insert({
        "user_id": user_id,
        "platform": "all",
        "sync_type": "backfill",
        "status": "completed",
        "records_synced": total,
    }).execute()

    return total
