# Sync Orchestration

## Goal
Manage per-user, per-platform sync jobs through a centralized queue so that data stays fresh, rate limits are respected, and paid users get priority.

## Inputs
- `sync_jobs` table in Supabase (source of truth for all pending/running syncs)
- `connected_accounts` table (which platforms each user has connected)
- `profiles` table (user plan tier for priority and limit checks)
- Platform rate limit budgets (especially Etsy's shared 10K QPD)

## Tools
- `execution/sync_scheduler.py` -- Modal cron that picks and dispatches jobs
- `execution/sync_etsy.py` -- Etsy data sync (orders, listings, receipts, payments)
- `execution/sync_shopify.py` -- Shopify data sync (orders, products, customers)
- `execution/sync_printify.py` -- Printify data sync (orders, products, fulfillments)
- `execution/token_manager.py` -- Token retrieval and refresh
- `execution/rate_limiter.py` -- Global and per-user rate budget tracking

## Steps

### 1. Scheduler Tick (every 1 minute via Modal cron)
1. Query `sync_jobs` for rows where `status = 'queued'` and `next_run_at <= now()`.
2. Order by priority:
   - **Plan tier weight**: Pro(4) > Growth(3) > Starter(2) > Free(1)
   - **Job type weight**: `backfill`(1) < `incremental`(2) < `webhook_triggered`(3)
   - Composite score: `plan_weight * 10 + job_type_weight`. Highest first.
3. For each candidate job, check:
   - **Plan limits**: Has the user exceeded their monthly order quota? If yes, skip (set `status = 'plan_limit_reached'`).
   - **Rate budget**: Is there remaining API budget for this platform? (See rate limiting below.)
   - **Concurrency**: Is another job already `running` for this user + platform? If yes, skip.
4. Set selected jobs to `status = 'running'`, `started_at = now()`.
5. Dispatch each job to the appropriate sync script via Modal `.spawn()`.

### 2. Sync Execution (per job)
1. Retrieve encrypted tokens from `connected_accounts` via `token_manager`.
2. If token refresh is needed (Etsy), refresh first and update stored tokens.
3. Fetch data incrementally using the stored cursor (`sync_jobs.cursor`):
   - Etsy: `updated_after` timestamp on receipts/listings endpoints.
   - Shopify: `updated_at_min` on orders/products endpoints, or GraphQL cursor.
   - Printify: `page` pagination on orders endpoint.
4. Upsert fetched data into the appropriate Supabase tables (e.g. `orders`, `line_items`, `listings`, `customers`).
5. Update `sync_jobs.cursor` to the latest timestamp/page for the next run.
6. On completion: Set `status = 'completed'`, `completed_at = now()`, and schedule next run:
   - Free: every 60 minutes
   - Starter: every 30 minutes
   - Growth: every 15 minutes
   - Pro: every 5 minutes
7. On failure: Set `status = 'failed'`, increment `retry_count`. If `retry_count < 5`, set `status = 'queued'` with exponential backoff (`next_run_at = now() + 2^retry_count minutes`). If >= 5, set `status = 'dead'` and notify user.

### 3. Rate Limiting

#### Etsy (Global Shared Budget)
- 10,000 queries per day shared across ALL users of the app.
- Track daily usage in a Supabase `rate_budgets` table: `{ platform: "etsy", date: "2025-01-15", used: 4532, limit: 10000 }`.
- Before dispatching an Etsy job, check remaining budget. Reserve an estimated query count (e.g. 50 for an incremental sync, 500 for a backfill page).
- After sync completes, update `used` with actual queries consumed.
- If budget is exhausted, skip all Etsy jobs until midnight UTC reset.
- Prioritize paid users when budget is scarce (below 20% remaining).

#### Shopify (Per-Store)
- Leaky bucket: 40 requests, 2/sec refill (REST). Track per `connected_accounts.id`.
- Read `X-Shopify-Shop-Api-Call-Limit` headers and throttle accordingly.

#### Printify (Per-Token)
- Respect `Retry-After` headers. Back off on 429s.

## Output
- `sync_jobs` table rows continuously cycling through `queued -> running -> completed -> queued`.
- Fresh data in `orders`, `listings`, `customers`, `payments` tables.
- `rate_budgets` table tracking daily API consumption.

## Notes / Edge Cases
- **Stale jobs**: If a job stays in `running` for > 15 minutes, the scheduler should mark it `failed` (assume the Modal function crashed).
- **User disconnect**: If a user disconnects a platform (`connected_accounts.status = 'disconnected'`), cancel all queued jobs for that user + platform.
- **Backfill vs. incremental**: Backfill jobs pull historical data in large batches and have lower priority. Incremental jobs pull recent changes and run more frequently.
- **Concurrency cap**: Maximum 10 sync functions running simultaneously across all users (Modal concurrency limit). Adjust based on plan.
- **Midnight reset**: Etsy QPD resets at midnight UTC. The scheduler should pre-queue high-priority Etsy syncs just after midnight to maximize freshness.
- **Observability**: Log every job state transition with `user_id`, `platform`, `job_type`, `duration`, and `queries_used` for monitoring and debugging.
