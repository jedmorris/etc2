# Daily Financial Roll

## Goal
Compute daily and monthly financial summaries per user and per platform, rolling up order data into pre-aggregated tables for fast dashboard queries and P&L reporting.

## Inputs
- `orders` table -- All synced orders across platforms
- `line_items` table -- Per-item details with prices and quantities
- `printify_products` table -- COGS (base cost) per product variant
- `payments` table -- Etsy payment/ledger entries (fees, deposits)
- `profiles` table -- User info, plan tier, timezone
- `connected_accounts` table -- Which platforms each user has connected

## Tools
- `execution/financial_roller.py` -- Compute daily and monthly aggregations
- `execution/sync_scheduler.py` -- Trigger nightly via Modal cron

## Steps

### 1. Nightly Trigger
- Runs nightly at **2:00 AM UTC**, staggered by user:
  - Process users in batches of 50.
  - Stagger start times by 1 second per user to avoid Supabase write contention.
- Recompute the previous day (UTC) and the current partial month.

### 2. Daily Financial Computation
For each user, for each platform (etsy, shopify, printify), for the target date:

```sql
-- Pseudocode for daily_financials upsert
{
  user_id,
  platform,
  date,                     -- e.g. 2025-01-15
  order_count,              -- COUNT of orders completed/paid on this date
  units_sold,               -- SUM of line_items.quantity
  gross_revenue,            -- SUM of order totals (before fees)
  discounts,                -- SUM of discount amounts applied
  net_revenue,              -- gross_revenue - discounts
  cogs,                     -- SUM of (printify base cost * quantity) for matched items
  platform_fees,            -- Etsy: transaction + listing + payment processing fees
                            -- Shopify: Shopify Payments processing fees
  shipping_revenue,         -- SUM of shipping charges collected
  shipping_cost,            -- SUM of actual shipping costs paid (from Printify)
  tax_collected,            -- SUM of sales tax collected
  gross_profit,             -- net_revenue - cogs - platform_fees - shipping_cost
  net_profit,               -- gross_profit - tax_collected (simplified; tax is pass-through)
  avg_order_value,          -- net_revenue / order_count
  refund_count,             -- COUNT of refunded orders
  refund_amount,            -- SUM of refund amounts
  computed_at: now()
}
```

### 3. Platform Fee Breakdown

#### Etsy Fees
- **Transaction fee**: 6.5% of item price + shipping
- **Listing fee**: $0.20 per listing (on sale, not per order -- approximate from ledger)
- **Payment processing**: 3% + $0.25 per transaction (Etsy Payments)
- **Offsite ads fee**: 15% (or 12% for $10K+ sellers) if order came from Etsy ad -- check `is_from_offsite_ads` flag
- Source: `payments` table ledger entries or compute from order data

#### Shopify Fees
- **Shopify Payments**: 2.9% + $0.30 per transaction (varies by Shopify plan)
- **No listing fee** for standard plans
- **Transaction fee**: 0-2% if using a third-party payment gateway
- Source: Compute from order data using known fee rates

#### Printify Costs
- **Base cost**: Per-variant cost from `printify_products` table
- **Shipping cost**: From Printify order data
- Source: `printify_products` and Printify order line items

### 4. Monthly P&L Roll-up
After computing daily rows, aggregate into `monthly_pnl`:

```
{
  user_id,
  month,                    -- e.g. "2025-01"
  platform: "all",          -- plus per-platform rows
  total_orders,
  total_units,
  gross_revenue,
  net_revenue,
  total_cogs,
  total_platform_fees,
  total_shipping_cost,
  total_refunds,
  gross_profit,
  gross_margin_pct,         -- gross_profit / net_revenue * 100
  net_profit,
  net_margin_pct,           -- net_profit / net_revenue * 100
  avg_order_value,
  customer_count,           -- COUNT(DISTINCT customer_id)
  top_product_id,           -- listing with highest revenue this month
  computed_at: now()
}
```

Generate rows for:
- Each platform individually (etsy, shopify, printify)
- A combined "all" row that sums across platforms (avoiding double-counting orders that appear on both Etsy and Printify)

### 5. Cross-Platform Deduplication
- An Etsy order fulfilled by Printify appears in both `orders` (platform=etsy) and `orders` (platform=printify).
- The "all" rollup uses the **Etsy order as the revenue source** and the **Printify order as the COGS source**.
- Match via `orders.external_id` or a linking table.
- Never double-count revenue or COGS.

## Output
- `daily_financials` table: one row per user per platform per date.
- `monthly_pnl` table: one row per user per platform per month, plus an "all" combined row.
- Dashboard reads from these pre-aggregated tables for instant chart rendering.

## Notes / Edge Cases
- **Timezone handling**: Users may be in different timezones. For MVP, all aggregations use UTC dates. Future enhancement: allow users to set their timezone in `profiles` and shift accordingly.
- **Retroactive corrections**: If an order is refunded or updated after the daily roll has run, the next nightly run will recompute that day's row. The pipeline is idempotent -- upsert on `(user_id, platform, date)`.
- **Missing COGS**: If a line item has no matching Printify product (e.g. non-POD item, vintage, or supply), set `cogs = 0` for that item and flag it in `daily_financials.cogs_incomplete = true`.
- **Currency**: For MVP, assume all amounts are in the user's primary currency (from their Etsy/Shopify shop settings). Multi-currency conversion is a future enhancement.
- **Historical gap fill**: On first run after backfill, compute daily financials for all historical dates in one batch. This may take several minutes for high-volume sellers.
- **Stale data guard**: If a user's last sync was > 48 hours ago, flag the financial data as `"stale"` in the dashboard.
- **Performance**: Use bulk upserts (Supabase `upsert` with conflict handling) rather than row-by-row inserts. Batch by 500 rows.
