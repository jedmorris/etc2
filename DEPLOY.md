# etC2 Production Deploy Guide

## 1. Vercel Project Setup

1. Install [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
2. Link repo: `cd app && vercel link`
3. Set framework to **Next.js** (auto-detected from `vercel.json`)
4. Deploy preview: `vercel` — verify it builds clean
5. Deploy production: `vercel --prod`

## 2. Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_URL` — Supabase project URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)

### Stripe
- `STRIPE_SECRET_KEY` — Stripe secret key (use `sk_live_...` for production)
- `STRIPE_PUBLISHABLE_KEY` — Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (create new for prod URL)
- `STRIPE_STARTER_PRICE_ID` — Price ID for Starter plan
- `STRIPE_PRO_PRICE_ID` — Price ID for Pro plan
- `STRIPE_GROWTH_PRICE_ID` — Price ID for Growth plan
- `STRIPE_METERED_PRICE_ID` — Metered usage price ID

### Platform Integrations
- `ETSY_API_KEY` — Etsy API key
- `ETSY_WEBHOOK_SECRET` — Etsy webhook verification secret
- `SHOPIFY_API_KEY` — Shopify API key
- `SHOPIFY_API_SECRET` — Shopify API secret

### Other
- `TOKEN_ENCRYPTION_KEY` — Encryption key for stored API tokens
- `RESEND_API_KEY` — Resend email API key
- `FROM_EMAIL` — Sender email address
- `NEXT_PUBLIC_APP_URL` — Production URL (e.g., `https://app.etc2.com`)

## 3. Supabase Production Setup

1. Create a production Supabase project (or use existing)
2. Run schema migration: apply `supabase_schema.sql`
3. Verify RLS policies are enabled on all tables
4. Set up Supabase Auth redirect URLs for production domain
5. Generate production API keys and update Vercel env vars

## 4. Stripe Production Setup

1. Switch to Stripe live mode
2. Create products/prices matching your test setup (or use `scripts/setup-stripe-test.sh` as reference)
3. Create webhook endpoint: `https://YOUR_DOMAIN/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## 5. Modal Deployment

```bash
cd execution
modal deploy modal_app.py
```

Set Modal secrets for production Supabase credentials:
```bash
modal secret create supabase-prod SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
```

## 6. DNS / Domain Setup

1. Add custom domain in Vercel Dashboard → Settings → Domains
2. Configure DNS records as instructed by Vercel (typically CNAME or A record)
3. SSL is automatic via Vercel

## 7. Post-Deploy Verification

- [ ] Visit `/api/health` — should return `{ status: "ok" }`
- [ ] Sign up flow works (create account, verify email)
- [ ] Login/logout works
- [ ] Stripe checkout flow completes
- [ ] Webhook endpoints respond (check Stripe dashboard for delivery status)
- [ ] Platform connections work (Printify, Etsy, Shopify)
- [ ] Data syncs and dashboard shows live data
- [ ] Mobile layout is correct
