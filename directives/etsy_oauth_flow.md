# Etsy OAuth Flow

## Goal
Connect an end user's Etsy shop to their etC2 account via OAuth 2.0 with PKCE so the platform can read orders, listings, receipts, and payments on their behalf.

## Inputs
- `user_id`: Supabase auth user ID
- `etsy_api_key`: From `.env` (`ETSY_API_KEY`) -- shared across all users (public app)
- `etsy_api_secret`: From `.env` (`ETSY_API_SECRET`)
- `redirect_uri`: From `.env` (`ETSY_REDIRECT_URI`), e.g. `https://app.etc2.com/callback/etsy`

## Tools
- `execution/token_manager.py` -- Encrypt/decrypt/store/refresh tokens in Supabase `connected_accounts`
- `execution/etsy_client.py` -- Etsy API v3 wrapper (auth, requests, pagination)

## Steps
1. **User clicks "Connect Etsy"** in the onboarding wizard or settings page.
2. **Generate PKCE pair**:
   - Create a random `code_verifier` (43-128 chars, URL-safe).
   - Derive `code_challenge` = base64url(sha256(code_verifier)).
   - Store `code_verifier` in Supabase `oauth_states` table keyed by a random `state` param, with `user_id` and a 10-minute TTL.
3. **Redirect user** to Etsy authorization URL:
   ```
   https://www.etsy.com/oauth/connect
     ?response_type=code
     &client_id=<etsy_api_key>
     &redirect_uri=<redirect_uri>
     &scope=transactions_r listings_r shops_r email_r
     &state=<state>
     &code_challenge=<code_challenge>
     &code_challenge_method=S256
   ```
4. **User grants consent** on Etsy. Etsy redirects to `redirect_uri?code=<auth_code>&state=<state>`.
5. **Callback handler**:
   - Validate `state` against `oauth_states` table; reject if expired or missing.
   - Look up the stored `code_verifier` for this state.
   - Exchange auth code for tokens:
     ```
     POST https://api.etsy.com/v3/public/oauth/token
     {
       "grant_type": "authorization_code",
       "client_id": "<etsy_api_key>",
       "redirect_uri": "<redirect_uri>",
       "code": "<auth_code>",
       "code_verifier": "<code_verifier>"
     }
     ```
   - Response contains `access_token`, `refresh_token`, `expires_in`.
6. **Store tokens**: Call `token_manager.encrypt_and_store()` to write to Supabase `connected_accounts`:
   ```
   {
     user_id, platform: "etsy",
     access_token_enc, refresh_token_enc,
     expires_at, scopes, etsy_user_id
   }
   ```
7. **Fetch shop_id**: Call `GET /v3/application/users/<etsy_user_id>/shops` and store `shop_id` in the connected account record.
8. **Clean up**: Delete the `oauth_states` row.
9. **Advance onboarding**: Update `profiles.onboarding_step` to the next step.

## Output
- Row in `connected_accounts` with encrypted Etsy tokens, `shop_id`, and scopes.
- User redirected back to onboarding wizard / dashboard.

## Notes / Edge Cases
- **Public app**: Etsy API key is shared across all users. The 10,000 queries-per-day (QPD) limit is shared across the entire app, not per user. The sync orchestrator must budget this globally.
- **PKCE is mandatory**: Etsy v3 requires PKCE for all OAuth flows. Never skip `code_verifier`.
- **Token refresh**: Access tokens expire (typically 1 hour). `token_manager.py` must auto-refresh using the refresh token before making API calls. Refresh tokens are long-lived but single-use (Etsy issues a new refresh token on each refresh).
- **Scope changes**: If we need new scopes later, the user must re-authorize. Store granted scopes and compare before API calls.
- **Error states**: If the user denies consent, Etsy redirects with `error=access_denied`. Show a friendly message and let them retry.
- **Rate limit headers**: Etsy returns `X-RateLimit-Remaining` and `X-RateLimit-Limit`. Log these and feed them back to the sync orchestrator.
- **Multiple shops**: A user can own multiple Etsy shops. For MVP, connect the primary shop only. Store `shop_id` explicitly.
