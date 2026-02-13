# Shopify OAuth Flow

## Goal
Connect a user's Shopify store to their etC2 account so the platform can create listings, manage orders, and sync inventory. Supports two modes: full OAuth app install and manual access token entry.

## Inputs
- `user_id`: Supabase auth user ID
- `shop_domain`: The user's myshopify.com domain (e.g. `my-store.myshopify.com`)
- `shopify_api_key`: From `.env` (`SHOPIFY_API_KEY`)
- `shopify_api_secret`: From `.env` (`SHOPIFY_API_SECRET`)
- `redirect_uri`: From `.env` (`SHOPIFY_REDIRECT_URI`)

## Tools
- `execution/token_manager.py` -- Encrypt/decrypt/store/refresh tokens in Supabase `connected_accounts`
- `execution/shopify_client.py` -- Shopify Admin API wrapper (REST + GraphQL)

## Steps

### Mode A: OAuth App Install (Primary)

1. **User enters shop domain** in the onboarding wizard or settings page.
2. **Generate install URL**:
   ```
   https://<shop_domain>/admin/oauth/authorize
     ?client_id=<shopify_api_key>
     &scope=read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_customers
     &redirect_uri=<redirect_uri>
     &state=<random_nonce>
   ```
   Store `state` + `user_id` + `shop_domain` in Supabase `oauth_states` with a 10-minute TTL.
3. **User installs app** on Shopify and grants permissions.
4. **Callback handler** receives `?code=<auth_code>&hmac=<hmac>&shop=<shop>&state=<state>&timestamp=<ts>`:
   - Validate `state` against `oauth_states` table.
   - **Verify HMAC**: Compute HMAC-SHA256 of the query params (excluding `hmac`) using `shopify_api_secret`. Reject if mismatch.
   - Confirm `shop` param matches the stored `shop_domain`.
5. **Exchange code for permanent token**:
   ```
   POST https://<shop_domain>/admin/oauth/access_token
   {
     "client_id": "<shopify_api_key>",
     "client_secret": "<shopify_api_secret>",
     "code": "<auth_code>"
   }
   ```
   Response: `{ "access_token": "shpat_...", "scope": "..." }`.
   Shopify offline tokens do not expire.
6. **Store token**: Call `token_manager.encrypt_and_store()`:
   ```
   {
     user_id, platform: "shopify",
     access_token_enc, refresh_token_enc: null,
     shop_domain, scopes, shopify_shop_id
   }
   ```
7. **Fetch shop info**: `GET /admin/api/2024-01/shop.json` to store shop name, currency, timezone.
8. **Register mandatory webhooks** via Shopify Admin API:
   - `orders/create`, `orders/updated` -- keep orders in sync
   - `products/update`, `products/delete` -- keep listings in sync
   - `app/uninstalled` -- clean up tokens on uninstall
   Point all webhook URLs to the Modal webhook endpoint.
9. **Clean up**: Delete `oauth_states` row. Advance onboarding step.

### Mode B: Manual Token Entry (Fallback)

1. **User creates a Custom App** in Shopify Admin > Settings > Apps > Develop apps.
2. **User pastes the Admin API access token** into etC2 settings.
3. **Validate token**: `GET /admin/api/2024-01/shop.json` with the provided token.
4. **Store token**: Same as step 6 above, with `auth_method: "manual"`.
5. **Register webhooks**: Same as step 8 above.

## Output
- Row in `connected_accounts` with encrypted Shopify token, `shop_domain`, `shopify_shop_id`, and scopes.
- Mandatory webhooks registered on the Shopify store.
- User redirected to next onboarding step or dashboard.

## Notes / Edge Cases
- **Offline tokens**: Shopify offline access tokens do not expire and do not need refresh. No `refresh_token` is stored.
- **HMAC verification is critical**: Always verify the callback HMAC to prevent CSRF and forgery. Reject requests where HMAC does not match.
- **Webhook registration**: If webhook registration fails, log the error but do not block the flow. Retry webhook registration in a background job.
- **App uninstall**: When the `app/uninstalled` webhook fires, mark the `connected_accounts` row as `status: "disconnected"` and stop syncing. Do not delete user data.
- **API versioning**: Pin to a stable Shopify API version (e.g. `2024-01`). Update quarterly.
- **Rate limits**: Shopify uses a leaky bucket (40 requests, 2/sec refill for REST; 1000 points for GraphQL). The sync orchestrator must respect these.
- **Scopes**: If the app requires additional scopes in the future, the user must re-install the app (Shopify re-triggers OAuth for scope upgrades).
- **Embedded app**: If etC2 becomes a Shopify embedded app later, session tokens replace OAuth. This SOP covers the standalone flow only.
