# etC2 Infrastructure Setup Guide

Everything you need to go from zero to running. Follow these steps in order.

---

## Step 1: Supabase Project

1. Create a project at [supabase.com](https://supabase.com) (choose US East region)
2. Copy these values from **Settings > API**:
   - Project URL
   - Anon (public) key
   - Service Role key (keep secret)
3. Go to **SQL Editor** and run the contents of `supabase_schema.sql` — this creates 17 tables, triggers, and functions
4. **Auth > Providers**: Enable **Email**
5. **Auth > URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/**`

## Step 2: Stripe (Test Mode)

### Option A: Automated (Recommended)

1. Install and authenticate the Stripe CLI:
   ```bash
   stripe login
   ```
2. Run the setup script to create products, prices, and get env vars:
   ```bash
   bash scripts/setup-stripe-test.sh
   ```
3. Start webhook forwarding (keep this terminal open during dev):
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the webhook signing secret (`whsec_...`) from the output

### Option B: Manual (Dashboard)

1. Create an account at [stripe.com](https://stripe.com)
2. In **Test Mode**, create 3 products with monthly prices:
   - Starter — $19/mo
   - Growth — $49/mo
   - Pro — $99/mo
3. (Optional) Create a metered price for overage billing
4. Note all `price_xxx` IDs
5. **Developers > Webhooks > Add endpoint**:
   - URL: `<your-url>/api/webhooks/stripe`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
6. Copy the **webhook signing secret** (`whsec_...`)

## Step 3: Etsy Developer App

1. Register at [developers.etsy.com](https://developers.etsy.com)
2. Create a v3 app (select **Public** type for OAuth)
3. Set the callback URL: `http://localhost:3000/callback/etsy`
4. Note the **Keystring** — this is your `ETSY_API_KEY`
5. No client secret needed (Etsy uses PKCE flow)
6. **Webhooks**: In the Etsy developer portal, go to **Webhooks** and add an endpoint:
   - URL: `<your-url>/api/webhooks/etsy`
   - Events: `order.paid`
7. Copy the **signing secret** (`whsec_...`) — this is your `ETSY_WEBHOOK_SECRET`

## Step 4: Shopify Partner App

1. Create an app at [partners.shopify.com](https://partners.shopify.com)
2. **App URL**: `http://localhost:3000`
3. **Allowed redirection URL(s)**: `http://localhost:3000/callback/shopify`
4. **Scopes**: `read_orders`, `read_products`, `read_customers`
5. Copy the **API Key** and **API Secret Key**

## Step 5: Modal Account

1. Sign up at [modal.com](https://modal.com)
2. Install and authenticate:
   ```bash
   pip install modal
   modal token new
   ```
3. Note the token ID and secret (stored in `~/.modal.toml`)

## Step 6: Resend (Email)

1. Sign up at [resend.com](https://resend.com)
2. Verify your sending domain
3. Create an API key

## Step 7: Token Encryption Key

Generate a 32-byte hex key for AES-256-GCM token encryption:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 8: Assemble `.env.local`

Copy `.env.example` to `app/.env.local` and fill in all values:

```bash
cp .env.example app/.env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_URL=https://your-project.supabase.co

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_METERED_PRICE_ID=price_...

# Etsy (PKCE — no secret needed)
ETSY_API_KEY=your-etsy-keystring
ETSY_WEBHOOK_SECRET=whsec_...

# Shopify
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret

# Encryption
TOKEN_ENCRYPTION_KEY=your-64-hex-char-key

# Email
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note:** Redirect URIs are derived from `NEXT_PUBLIC_APP_URL` automatically — no separate redirect URI env vars needed.

## Step 9: Modal Secrets

Create a Modal secret group with the values the sync workers need:

```bash
modal secret create etC2-secrets \
  SUPABASE_URL=<val> \
  SUPABASE_SERVICE_ROLE_KEY=<val> \
  TOKEN_ENCRYPTION_KEY=<val> \
  ETSY_API_KEY=<val> \
  ETSY_WEBHOOK_SECRET=<val> \
  SHOPIFY_API_KEY=<val> \
  SHOPIFY_API_SECRET=<val> \
  RESEND_API_KEY=<val> \
  FROM_EMAIL=<val>
```

## Step 10: Run & Deploy

### Local Development

```bash
cd app
npm install
npm run dev
```

### Deploy Sync Workers (Modal)

```bash
modal deploy execution/modal_app.py
```

### Production (Vercel)

1. Push to GitHub and connect to [Vercel](https://vercel.com)
2. Set all env vars from Step 8 in Vercel project settings
3. Update OAuth callback URLs to your production domain:
   - Etsy: `https://yourdomain.com/callback/etsy`
   - Shopify: `https://yourdomain.com/callback/shopify`
4. Update webhook URLs:
   - Stripe: `https://yourdomain.com/api/webhooks/stripe`
   - Etsy: `https://yourdomain.com/api/webhooks/etsy`
   - Shopify: auto-registered during OAuth connect
   - Printify: auto-registered during OAuth connect
5. Update Supabase Site URL and redirect URLs to production domain
6. Update Modal secrets with production values

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Etsy "invalid redirect_uri" | Ensure the callback URL in your Etsy app settings exactly matches `NEXT_PUBLIC_APP_URL + /callback/etsy` |
| Shopify OAuth fails | Check that Shopify app redirect URL matches `NEXT_PUBLIC_APP_URL + /callback/shopify` |
| Stripe webhooks not firing | Verify the endpoint URL and that all 5 events are selected |
| Token decryption errors | Ensure `TOKEN_ENCRYPTION_KEY` is the same in `.env.local` and Modal secrets |
| Sync workers can't reach DB | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Modal secrets |
