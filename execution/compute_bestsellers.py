"""
Compute Bestseller Candidates for a single user.
Identifies products with high sales velocity and good margins.
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase_client import get_client

log = logging.getLogger(__name__)


def run(user_id: str) -> int:
    """Compute bestseller candidates. Returns number of candidates found."""
    db = get_client()

    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # Get all active products for the user (paginated)
    all_products: list[dict] = []
    offset = 0
    PAGE = 1000
    while True:
        try:
            page = (
                db.table("products")
                .select("id, title, printify_production_cost_cents, status")
                .eq("user_id", user_id)
                .eq("status", "active")
                .range(offset, offset + PAGE - 1)
                .execute()
            )
        except Exception as e:
            log.error("Failed to fetch products user=%s offset=%d: %s", user_id, offset, e)
            break
        all_products.extend(page.data or [])
        if not page.data or len(page.data) < PAGE:
            break
        offset += PAGE

    products = type("Result", (), {"data": all_products})()

    if not products.data:
        return 0

    # Get recent order IDs from the last 30 days (paginated)
    recent_order_ids: set[str] = set()
    offset = 0
    while True:
        try:
            page = (
                db.table("orders")
                .select("id")
                .eq("user_id", user_id)
                .gte("ordered_at", thirty_days_ago)
                .range(offset, offset + PAGE - 1)
                .execute()
            )
        except Exception as e:
            log.error("Failed to fetch recent orders user=%s offset=%d: %s", user_id, offset, e)
            break
        for o in (page.data or []):
            recent_order_ids.add(o["id"])
        if not page.data or len(page.data) < PAGE:
            break
        offset += PAGE

    if not recent_order_ids:
        return 0

    # Fetch line items in batches to avoid large IN() clause
    recent_order_list = list(recent_order_ids)
    all_recent_line_items: list[dict] = []
    BATCH = 500
    for i in range(0, len(recent_order_list), BATCH):
        batch = recent_order_list[i:i + BATCH]
        try:
            batch_result = (
                db.table("order_line_items")
                .select("product_id, quantity, total_cents, order_id")
                .eq("user_id", user_id)
                .not_.is_("product_id", "null")
                .in_("order_id", batch)
                .execute()
            )
            all_recent_line_items.extend(batch_result.data or [])
        except Exception as e:
            log.error("Failed to fetch line items batch %d user=%s: %s", i, user_id, e)

    line_items_with_order = type("Result", (), {"data": all_recent_line_items})()

    # Aggregate by product_id
    product_sales: dict[str, dict] = {}
    for item in (line_items_with_order.data or []):
        pid = item.get("product_id")
        if not pid:
            continue
        if pid not in product_sales:
            product_sales[pid] = {"quantity": 0, "revenue_cents": 0}
        product_sales[pid]["quantity"] += item.get("quantity", 1)
        product_sales[pid]["revenue_cents"] += item.get("total_cents", 0)

    # Build a set of product IDs that had recent sales for cleanup
    active_candidate_ids = set()

    candidates = 0
    for product in products.data:
        product_id = product["id"]

        sales = product_sales.get(product_id)
        if not sales or sales["quantity"] < 3:
            continue  # Need at least 3 recent sales

        recent_qty = sales["quantity"]
        revenue = sales["revenue_cents"]
        cogs_per_unit = product.get("printify_production_cost_cents") or 0

        # Calculate metrics
        sales_velocity = recent_qty / 30.0  # Units per day
        total_cogs = cogs_per_unit * recent_qty
        margin_pct = ((revenue - total_cogs) / revenue * 100) if revenue > 0 else 0

        # Scoring: velocity * margin
        score = sales_velocity * max(margin_pct, 0) / 10

        # Determine pipeline stage
        stage = "candidate"
        if score > 50:
            stage = "top_performer"
        elif score > 20:
            stage = "strong"
        elif score > 5:
            stage = "promising"

        try:
            db.table("bestseller_candidates").upsert({
                "user_id": user_id,
                "product_id": product_id,
                "score": round(score, 2),
                "sales_velocity": round(sales_velocity, 4),
                "margin_pct": round(margin_pct, 2),
                "pipeline_stage": stage,
            }, on_conflict="user_id,product_id").execute()
            active_candidate_ids.add(product_id)
            candidates += 1
        except Exception as e:
            log.error("Failed to upsert bestseller candidate user=%s product=%s: %s", user_id, product_id, e)

    # Clean up stale candidates (products no longer qualifying)
    try:
        existing = (
            db.table("bestseller_candidates")
            .select("product_id")
            .eq("user_id", user_id)
            .execute()
        )
        for row in (existing.data or []):
            if row["product_id"] not in active_candidate_ids:
                db.table("bestseller_candidates").delete().eq(
                    "user_id", user_id
                ).eq("product_id", row["product_id"]).execute()
    except Exception as e:
        log.error("Failed to clean stale bestsellers user=%s: %s", user_id, e)

    return candidates
