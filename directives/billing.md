# Billing

## Goal
Implement hybrid subscription + metered billing via Stripe so users pay a base plan fee plus per-order overage charges.

## Inputs
- `user_id`: Supabase auth user ID
- Stripe Price IDs from `.env`:
  - `STRIPE_STARTER_PRICE_ID` ($19/mo)
  - `STRIPE_GROWTH_PRICE_ID` ($49/mo)
  - `STRIPE_PRO_PRICE_ID` ($99/mo)
  - `STRIPE_METERED_PRICE_ID` (overage: $0.02/order)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` from `.env`

## Tools
- `execution/stripe_client.py` -- Stripe SDK wrapper (checkout sessions, subscriptions, usage records)
- `execution/token_manager.py` -- For any token-related needs
- Supabase `profiles` table -- Stores plan tier, `stripe_customer_id`, `stripe_subscription_id`, billing period usage

## Steps

### Plan Structure

| Plan    | Price   | Included Orders/mo | Sync Frequency | Platforms |
|---------|---------|---------------------|----------------|-----------|
| Free    | $0      | 50                  | 60 min         | 2         |
| Starter | $19/mo  | 300                 | 30 min         | All       |
| Growth  | $49/mo  | 1,500               | 15 min         | All       |
| Pro     | $99/mo  | 5,000               | 5 min          | All       |

**Overage**: $0.02 per order beyond the plan's included quota.

### Checkout Flow
1. User selects a plan on the pricing page or onboarding wizard.
2. **Create Stripe Checkout Session**:
   - `mode: "subscription"`
   - `line_items`: The selected plan's price ID + the metered price ID (for overage tracking).
   - `metadata: { user_id }` for webhook correlation.
   - `success_url` and `cancel_url` pointing back to the app.
3. Redirect user to `session.url`.

### Webhook Events
Handle these Stripe webhook events at the Modal webhook endpoint:

1. **`checkout.session.completed`**:
   - Extract `user_id` from `metadata`.
   - Store `stripe_customer_id` and `stripe_subscription_id` in `profiles`.
   - Set `profiles.plan` to the selected tier.
   - Set `profiles.billing_period_start` to the subscription's current period start.
   - Set `profiles.orders_this_period` to 0.

2. **`customer.subscription.updated`**:
   - Detect plan changes (upgrades/downgrades).
   - Update `profiles.plan` to reflect the new tier.
   - If downgraded, enforce new limits immediately on the next sync cycle.

3. **`customer.subscription.deleted`**:
   - Set `profiles.plan` to `"free"`.
   - Cancel any overage metered subscription item.
   - User retains data but syncs at free tier frequency and limits.

4. **`invoice.paid`**:
   - Reset `profiles.orders_this_period` to 0 (new billing cycle).
   - Update `profiles.billing_period_start`.
   - Log the payment in a `billing_events` table for audit.

5. **`invoice.payment_failed`**:
   - Set `profiles.billing_status` to `"past_due"`.
   - After 3 failed attempts (Stripe handles retries), downgrade to free.
   - Send email notification to user via Resend.

### Usage Metering
1. Every time a new order is synced and inserted into the `orders` table, increment `profiles.orders_this_period`.
2. If `orders_this_period > plan_order_limit`, report overage usage to Stripe:
   ```python
   stripe.SubscriptionItem.create_usage_record(
       metered_subscription_item_id,
       quantity=1,  # per order over limit
       timestamp=now,
       action="increment"
   )
   ```
3. Stripe bills overage at the end of the billing period automatically.

### Plan Limit Enforcement
- The sync orchestrator checks `profiles.plan` and `orders_this_period` before running sync jobs.
- Free users who hit 50 orders: syncs continue but orders are counted as overage (they must upgrade or accept overage charges -- for Free, syncs pause instead since there is no payment method).
- Display usage bar in the dashboard: `orders_this_period / plan_order_limit`.

## Output
- `profiles` table updated with `plan`, `stripe_customer_id`, `stripe_subscription_id`, `orders_this_period`, `billing_period_start`, `billing_status`.
- `billing_events` table for audit trail of all payment events.
- Overage usage records reported to Stripe for metered billing.

## Notes / Edge Cases
- **Free tier**: No Stripe subscription is created. Free users have no `stripe_customer_id` until they upgrade.
- **Upgrade mid-cycle**: Stripe prorates by default. The new plan's order limit applies immediately. Do not reset `orders_this_period` -- the overage calculation adjusts based on the new limit.
- **Downgrade mid-cycle**: Takes effect at end of current billing period (Stripe default). Override if needed.
- **Webhook idempotency**: Stripe may send webhooks multiple times. Use `event.id` as an idempotency key. Store processed event IDs in `billing_events` and skip duplicates.
- **Webhook signature verification**: Always verify the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` before processing. Reject unverified events.
- **Test mode**: Use `sk_test_` keys and Stripe test webhooks during development. Switch to live keys only in production `.env`.
- **Tax**: Stripe Tax can be enabled later. Not in MVP scope.
- **Cancellation**: When a user cancels, they keep access until the end of the billing period. After that, downgrade to free.
