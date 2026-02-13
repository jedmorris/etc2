# Backfill

## Goal
Load all historical data from each connected platform after a user completes onboarding, populating the database with orders, listings, payments, and customers so the dashboard and analytics are immediately useful.

## Inputs
- `user_id`: Supabase auth user ID
- `connected_accounts` rows for the user (which platforms are connected, with tokens)
- `profiles.plan` (determines rate priority)

## Tools
- `execution/backfill_manager.py` -- Queue and coordinate backfill jobs
- `execution/sync_etsy.py` -- Etsy API data fetching (orders, listings, receipts, payments)
- `execution/sync_shopify.py` -- Shopify API data fetching (orders, products, customers)
- `execution/sync_printify.py` -- Printify API data fetching (orders, products, fulfillments)
- `execution/token_manager.py` -- Token retrieval and refresh
- `execution/rate_limiter.py` -- Global rate budget checks

## Steps

### 1. Queue Backfill Jobs
When triggered (after onboarding or manual re-trigger from settings):

1. For each connected platform, create `sync_jobs` rows with `job_type = 'backfill'`:

   **Etsy** (in execution order):
   ```
   { user_id, platform: "etsy", entity: "orders",    job_type: "backfill", status: "queued", priority: 1 }
   { user_id, platform: "etsy", entity: "listings",   job_type: "backfill", status: "queued", priority: 2 }
   { user_id, platform: "etsy", entity: "payments",   job_type: "backfill", status: "queued", priority: 3 }
   ```

   **Printify** (in execution order):
   ```
   { user_id, platform: "printify", entity: "orders",   job_type: "backfill", status: "queued", priority: 1 }
   { user_id, platform: "printify", entity: "products", job_type: "backfill", status: "queued", priority: 2 }
   ```

   **Shopify** (if connected, in execution order):
   ```
   { user_id, platform: "shopify", entity: "orders",    job_type: "backfill", status: "queued", priority: 1 }
   { user_id, platform: "shopify", entity: "products",  job_type: "backfill", status: "queued", priority: 2 }
   { user_id, platform: "shopify", entity: "customers", job_type: "backfill", status: "queued", priority: 3 }
   ```

2. Set `profiles.backfill_status = "in_progress"`.

### 2. Execution Order
- **Orders first** across all platforms. Orders are the core data entity; listings, payments, and customers depend on or enrich order data.
- Within a platform, jobs execute sequentially (priority 1 before 2 before 3) to avoid duplicate API calls and ensure referential integrity.
- Across platforms, jobs can run in parallel (Etsy orders and Printify orders can run simultaneously).

### 3. Per-Entity Backfill Logic

#### Etsy Orders
- Fetch via `GET /v3/application/shops/<shop_id>/receipts` with `was_paid=true`.
- Paginate using `offset` (100 per page).
- For each receipt, also fetch line items (transactions).
- Upsert into `orders` and `line_items` tables.
- Backfill window: all time (or configurable, e.g. last 2 years).

#### Etsy Listings
- Fetch via `GET /v3/application/shops/<shop_id>/listings` with `state=active`.
- Paginate (100 per page).
- Upsert into `listings` table.

#### Etsy Payments
- Fetch via `GET /v3/application/shops/<shop_id>/payment-account/ledger-entries`.
- Paginate and upsert into `payments` table.

#### Printify Orders
- Fetch via `GET /v2/shops/<shop_id>/orders.json` with pagination.
- Upsert into `orders` table with `platform = "printify"` and cross-reference with Etsy orders via external order ID.

#### Printify Products
- Fetch via `GET /v2/shops/<shop_id>/products.json` with pagination.
- Upsert into `listings` table or a `printify_products` table. Store print provider, variants, and base costs (COGS).

#### Shopify Orders / Products / Customers
- Standard Shopify Admin API pagination with `since_id` or `page_info` cursor.
- Upsert into respective tables.

### 4. Cursor Initialization
- After each entity backfill completes, set the `sync_jobs.cursor` to the latest `updated_at` timestamp (or equivalent). This becomes the starting point for future incremental syncs.

### 5. Completion
1. When all backfill jobs for a user are `completed`:
   - Set `profiles.backfill_status = "completed"`.
   - Set `profiles.backfill_completed_at = now()`.
2. Queue the first round of incremental sync jobs per `directives/sync_orchestration.md`.
3. Trigger initial financial roll-up per `directives/daily_financial_roll.md`.

## Output
- Fully populated `orders`, `line_items`, `listings`, `payments`, `customers` tables for the user.
- `sync_jobs` cursors initialized for incremental syncing.
- `profiles.backfill_status = "completed"`.

## Notes / Edge Cases
- **Rate budget awareness**: Backfill jobs consume many API calls. The Etsy backfill for a high-volume seller could use thousands of QPD. The rate limiter must reserve budget for incremental syncs of other users. Cap backfill at 50% of the daily Etsy QPD budget.
- **Large sellers**: Sellers with 10K+ orders may take multiple days to fully backfill on Etsy (due to QPD limits). Track progress via `sync_jobs.cursor` and resume across days.
- **Partial failure**: If one entity fails (e.g. listings), do not block other entities. Mark the failed job and retry independently.
- **Duplicate prevention**: Use `platform + platform_id` as a unique key for upserts. Never create duplicate order or listing records.
- **COGS linking**: Printify orders contain cost data (base price from print provider). Link Printify orders to Etsy orders via the external order reference to compute per-order COGS.
- **Backfill re-trigger**: Users can re-trigger a backfill from settings (e.g. after reconnecting a platform). Check for existing in-progress backfill jobs and skip if already running.
- **Dashboard UX**: While backfill is in progress, the dashboard should show a progress indicator (e.g. "Syncing orders... 450/1,200") and render data progressively as it arrives.
