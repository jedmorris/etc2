# Onboarding

## Goal
Guide new users through a 4-step wizard that connects their platforms and selects a plan, then triggers a backfill of their historical data.

## Inputs
- `user_id`: Supabase auth user ID (created after signup)
- `profiles` table row (created on signup with `onboarding_step: 0`)

## Tools
- `execution/token_manager.py` -- Token storage during platform connections
- `execution/etsy_client.py` -- Etsy OAuth (see `directives/etsy_oauth_flow.md`)
- `execution/printify_client.py` -- Printify token validation (see `directives/printify_connect.md`)
- `execution/shopify_client.py` -- Shopify OAuth (see `directives/shopify_oauth_flow.md`)
- `execution/stripe_client.py` -- Plan selection (see `directives/billing.md`)
- `execution/backfill_manager.py` -- Queue backfill jobs (see `directives/backfill.md`)

## Steps

### Step 0: Signup
1. User signs up via Supabase Auth (email/password or social).
2. A database trigger (or auth hook) creates a `profiles` row:
   ```
   {
     user_id, email, display_name,
     plan: "free", onboarding_step: 1,
     onboarding_completed: false,
     created_at: now()
   }
   ```
3. Redirect to `/onboarding`.

### Step 1: Connect Etsy (Required)
1. Display "Connect your Etsy shop" with a "Connect Etsy" button.
2. Execute the Etsy OAuth flow per `directives/etsy_oauth_flow.md`.
3. On success: Set `profiles.onboarding_step = 2`.
4. On skip: Not allowed -- Etsy is the primary platform and must be connected.

### Step 2: Connect Printify (Required)
1. Display "Connect your Printify account" with a token input field.
2. Execute the Printify connection flow per `directives/printify_connect.md`.
3. On success: Set `profiles.onboarding_step = 3`.
4. On skip: Not allowed -- Printify is needed for COGS data.

### Step 3: Connect Shopify (Optional)
1. Display "Connect your Shopify store (optional)" with two options:
   - "Connect via OAuth" -- full app install flow
   - "Skip for now" -- user can connect later from settings
2. If connecting: Execute the Shopify OAuth flow per `directives/shopify_oauth_flow.md`.
3. On success or skip: Set `profiles.onboarding_step = 4`.

### Step 4: Select Plan
1. Display pricing table with Free, Starter, Growth, Pro tiers.
2. If user selects Free: No Stripe interaction needed. Set `profiles.plan = "free"`.
3. If user selects a paid plan: Execute the Stripe checkout flow per `directives/billing.md`.
4. On success or Free selection: Set `profiles.onboarding_step = 5`, `profiles.onboarding_completed = true`.

### Post-Onboarding
1. **Trigger backfill**: Queue backfill jobs for each connected platform per `directives/backfill.md`.
2. **Redirect to dashboard** at `/dashboard` with a "Setting up your data..." loading state.
3. Dashboard polls for backfill completion and progressively renders data as it arrives.

## Output
- `profiles` row with `onboarding_completed: true` and `plan` set.
- `connected_accounts` rows for Etsy, Printify, and optionally Shopify.
- Backfill jobs queued in `sync_jobs` table.

## Notes / Edge Cases
- **Resume onboarding**: If the user leaves mid-flow and returns, read `profiles.onboarding_step` and resume from that step. Never restart from step 1.
- **OAuth redirect return**: After Etsy/Shopify OAuth redirect, the callback should detect that the user is in onboarding mode (check `onboarding_completed = false`) and redirect back to `/onboarding` rather than `/dashboard`.
- **Stripe checkout return**: If the user abandons checkout (closes the Stripe page), they return to `/onboarding` still on step 4. Let them retry or choose Free.
- **Re-connection**: If a user disconnects a platform later (from settings), they go through the same connection flow as onboarding but without the wizard UI.
- **Progress indicator**: The onboarding wizard should show a progress bar (e.g. "Step 2 of 4") so users know how much is left.
- **Error recovery**: If any connection step fails, show the error and let the user retry without losing progress on previous steps.
- **Mobile**: The onboarding wizard must work on mobile viewports. Keep forms simple and avoid multi-column layouts.
