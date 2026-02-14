"""
Compute Daily & Monthly Financials for a single user.
Aggregates order data into daily_financials and monthly_pnl tables.
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase_client import get_client

log = logging.getLogger(__name__)


def run(user_id: str) -> dict:
    """Compute financials for user. Returns result dict with days_processed and errors."""
    db = get_client()

    # Use UTC date to ensure consistency across timezones
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=7)

    days_processed = 0
    errors: list[str] = []

    for day_offset in range((end_date - start_date).days + 1):
        current_date = start_date + timedelta(days=day_offset)
        date_str = current_date.isoformat()
        next_date_str = (current_date + timedelta(days=1)).isoformat()

        for platform in ["etsy", "shopify", "printify"]:
            try:
                orders = (
                    db.table("orders")
                    .select("total_cents, subtotal_cents, shipping_cents, tax_cents, discount_cents, "
                            "printify_production_cost_cents, printify_shipping_cost_cents, "
                            "platform_fee_cents, transaction_fee_cents, payment_processing_fee_cents, listing_fee_cents")
                    .eq("user_id", user_id)
                    .eq("platform", platform)
                    .gte("ordered_at", date_str)
                    .lt("ordered_at", next_date_str)
                    .execute()
                )
            except Exception as e:
                msg = f"Failed to fetch orders platform={platform} date={date_str}: {e}"
                log.error("user=%s %s", user_id, msg)
                errors.append(msg)
                continue

            rows = orders.data or []
            if not rows:
                continue

            order_count = len(rows)
            gross_revenue = sum(r.get("subtotal_cents", 0) for r in rows)
            shipping_revenue = sum(r.get("shipping_cents", 0) for r in rows)
            tax_collected = sum(r.get("tax_cents", 0) for r in rows)
            discount = sum(r.get("discount_cents", 0) for r in rows)
            cogs = sum((r.get("printify_production_cost_cents") or 0) for r in rows)
            platform_fee = sum(r.get("platform_fee_cents", 0) for r in rows)
            txn_fee = sum(r.get("transaction_fee_cents", 0) for r in rows)
            processing_fee = sum(r.get("payment_processing_fee_cents", 0) for r in rows)
            listing_fee = sum(r.get("listing_fee_cents", 0) for r in rows)
            shipping_cost = sum((r.get("printify_shipping_cost_cents") or 0) for r in rows)

            total_fees = platform_fee + txn_fee + processing_fee + listing_fee
            net_revenue = gross_revenue - discount - total_fees
            profit = net_revenue - cogs - shipping_cost

            try:
                db.table("daily_financials").upsert({
                    "user_id": user_id,
                    "date": date_str,
                    "platform": platform,
                    "order_count": order_count,
                    "gross_revenue_cents": gross_revenue,
                    "shipping_revenue_cents": shipping_revenue,
                    "tax_collected_cents": tax_collected,
                    "discount_cents": discount,
                    "cogs_cents": cogs,
                    "platform_fee_cents": platform_fee,
                    "transaction_fee_cents": txn_fee,
                    "payment_processing_fee_cents": processing_fee,
                    "listing_fee_cents": listing_fee,
                    "shipping_cost_cents": shipping_cost,
                    "net_revenue_cents": net_revenue,
                    "profit_cents": profit,
                }, on_conflict="user_id,date,platform").execute()
            except Exception as e:
                msg = f"Failed to upsert daily_financials date={date_str} platform={platform}: {e}"
                log.error("user=%s %s", user_id, msg)
                errors.append(msg)

        days_processed += 1

    # Roll up into monthly_pnl
    _compute_monthly_pnl(db, user_id, start_date, end_date)

    result = {"days_processed": days_processed, "errors": errors, "status": "complete"}
    if errors:
        result["status"] = "partial"
        log.warning("user=%s financials computed with %d errors", user_id, len(errors))
    return result


def _compute_monthly_pnl(db, user_id: str, start_date, end_date):
    """Roll up daily financials into monthly P&L."""
    months_seen = set()
    current = start_date
    while current <= end_date:
        months_seen.add((current.year, current.month))
        current += timedelta(days=1)

    for year, month in months_seen:
        month_start = f"{year}-{month:02d}-01"
        if month == 12:
            month_end = f"{year + 1}-01-01"
        else:
            month_end = f"{year}-{month + 1:02d}-01"

        for platform in ["etsy", "shopify", "printify"]:
            try:
                daily = (
                    db.table("daily_financials")
                    .select("*")
                    .eq("user_id", user_id)
                    .eq("platform", platform)
                    .gte("date", month_start)
                    .lt("date", month_end)
                    .execute()
                )
            except Exception as e:
                log.error("Failed to fetch daily_financials for monthly rollup user=%s %s-%s %s: %s",
                          user_id, year, month, platform, e)
                continue

            rows = daily.data or []
            if not rows:
                continue

            order_count = sum(r.get("order_count", 0) for r in rows)
            gross = sum(r.get("gross_revenue_cents", 0) for r in rows)
            fees = sum(
                r.get("platform_fee_cents", 0) +
                r.get("transaction_fee_cents", 0) +
                r.get("payment_processing_fee_cents", 0) +
                r.get("listing_fee_cents", 0)
                for r in rows
            )
            cogs = sum(r.get("cogs_cents", 0) for r in rows)
            net = sum(r.get("net_revenue_cents", 0) for r in rows)
            profit = sum(r.get("profit_cents", 0) for r in rows)
            margin = (profit / gross * 100) if gross > 0 else 0

            try:
                db.table("monthly_pnl").upsert({
                    "user_id": user_id,
                    "year": year,
                    "month": month,
                    "platform": platform,
                    "order_count": order_count,
                    "gross_revenue_cents": gross,
                    "total_fees_cents": fees,
                    "cogs_cents": cogs,
                    "net_revenue_cents": net,
                    "profit_cents": profit,
                    "margin_pct": round(margin, 2),
                }, on_conflict="user_id,year,month,platform").execute()
            except Exception as e:
                log.error("Failed to upsert monthly_pnl user=%s %s-%s %s: %s",
                          user_id, year, month, platform, e)
