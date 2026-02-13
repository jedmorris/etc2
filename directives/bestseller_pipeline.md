# Bestseller Pipeline

## Goal
Identify Etsy products that are strong candidates for cross-listing on Shopify based on sales velocity, profit margins, and demand consistency. Surface these as actionable recommendations in the dashboard.

## Inputs
- `orders` table -- Etsy order history with line items
- `line_items` table -- Per-item details (listing_id, quantity, price)
- `listings` table -- Etsy listing metadata (title, tags, price, status)
- `printify_products` table -- COGS data (base cost per variant from Printify)
- `profiles` table -- User plan tier (determines access to this feature)

## Tools
- `execution/bestseller_scorer.py` -- Compute and rank bestseller candidates
- `execution/sync_scheduler.py` -- Trigger nightly via Modal cron

## Steps

### 1. Nightly Trigger
- Runs nightly at 3:00 AM UTC via Modal cron.
- Process one user at a time, ordered by plan tier (Pro first, then Growth, Starter, Free).
- Free tier: excluded from this pipeline (upgrade incentive).

### 2. Gather Per-Listing Metrics (last 90 days)
For each active Etsy listing belonging to the user, compute:

| Metric | Calculation |
|--------|-------------|
| `total_units_sold` | SUM(line_items.quantity) for this listing in the window |
| `total_revenue` | SUM(line_items.price * line_items.quantity) |
| `order_count` | COUNT(DISTINCT orders.id) containing this listing |
| `avg_order_value` | total_revenue / order_count |
| `days_with_sales` | COUNT(DISTINCT date(orders.created_at)) with at least one sale |
| `sales_velocity` | total_units_sold / 90 (units per day) |
| `demand_consistency` | days_with_sales / 90 (0.0 to 1.0) |
| `unit_cogs` | Printify base cost for this product variant (from printify_products) |
| `unit_profit` | avg selling price - unit_cogs - estimated_platform_fees |
| `profit_margin` | unit_profit / avg selling price |

### 3. Scoring Formula
```
score = (
    0.35 * normalize(sales_velocity) +
    0.25 * normalize(demand_consistency) +
    0.25 * normalize(profit_margin) +
    0.15 * normalize(total_revenue)
)
```
- `normalize()`: Min-max normalization across all of the user's listings so scores are 0.0 to 1.0.
- Minimum thresholds to qualify:
  - `total_units_sold >= 5`
  - `order_count >= 3`
  - `demand_consistency >= 0.1` (sales on at least 9 of 90 days)
  - `profit_margin > 0` (must be profitable)

### 4. Output to `bestseller_candidates` Table
Upsert rows:
```
{
  user_id,
  listing_id,
  listing_title,
  score,                -- 0.0 to 1.0
  rank,                 -- 1, 2, 3... within this user
  total_units_sold,
  total_revenue,
  sales_velocity,
  demand_consistency,
  profit_margin,
  unit_cogs,
  recommended_shopify_price,  -- suggested price with Shopify fee margin
  status: "candidate",        -- candidate | listed | dismissed
  computed_at: now()
}
```

### 5. Recommended Shopify Price
```
recommended_price = unit_cogs / (1 - target_margin - shopify_fee_rate)
```
Where:
- `target_margin`: 0.40 (40% target profit margin, configurable)
- `shopify_fee_rate`: 0.029 + 0.30/avg_order_value (Shopify Payments processing)

Clamp to not be lower than the current Etsy price (avoid undercutting yourself).

## Output
- `bestseller_candidates` table populated with ranked product recommendations.
- Dashboard surfaces top 10 candidates with a "List on Shopify" action button.

## Notes / Edge Cases
- **No Printify match**: If a listing has no matching Printify product (not a POD item, or manually fulfilled), set `unit_cogs = null` and exclude from margin-based scoring. Fall back to revenue-only scoring.
- **Seasonal products**: The 90-day window may miss seasonal items. Consider adding a 30-day velocity column for trend detection ("trending up" vs. "trending down").
- **Already on Shopify**: If the listing is already cross-listed on Shopify (check `listings` table for a Shopify variant), set `status = "listed"` instead of "candidate".
- **Dismissed items**: If a user dismisses a candidate from the dashboard, set `status = "dismissed"`. Do not re-surface it unless the user resets.
- **Data freshness**: This pipeline depends on up-to-date order data. If the user's last sync was > 24 hours ago, flag the results as potentially stale.
- **Minimum data**: If a user has fewer than 10 orders total, skip the pipeline and show "Need more sales data" in the dashboard.
- **Score stability**: To avoid noisy re-rankings, only update a candidate's rank if the score changed by more than 0.05 from the previous computation.
