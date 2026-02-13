"""
Etsy Listing Sync Worker - syncs active listings for a single user.
"""

from etsy_client import EtsyClient
from supabase_client import get_client


def run(user_id: str) -> int:
    """Sync Etsy listings for user. Returns number of records processed."""
    db = get_client()

    with EtsyClient(user_id) as client:
        all_listings = []
        offset = 0
        limit = 100

        while True:
            data = client.get_listings(state="active", limit=limit, offset=offset)
            results = data.get("results", [])
            all_listings.extend(results)
            if len(results) < limit:
                break
            offset += limit

    synced = 0
    for listing in all_listings:
        product_data = {
            "user_id": user_id,
            "title": listing.get("title", ""),
            "description": listing.get("description", "")[:500],
            "etsy_listing_id": str(listing["listing_id"]),
            "etsy_url": listing.get("url", ""),
            "status": listing.get("state", "active"),
            "price_cents": int(float(listing.get("price", {}).get("amount", 0)) / listing.get("price", {}).get("divisor", 100) * 100),
            "currency": listing.get("price", {}).get("currency_code", "USD"),
            "total_views": listing.get("views", 0),
            "total_favorites": listing.get("num_favorers", 0),
            "tags": listing.get("tags", []),
            "image_url": listing.get("images", [{}])[0].get("url_570xN", "") if listing.get("images") else "",
            "raw_data": listing,
        }

        db.table("products").upsert(
            product_data,
            on_conflict="user_id,etsy_listing_id",
        ).execute()
        synced += 1

    return synced
