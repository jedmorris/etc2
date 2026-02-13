# Printify Connect

## Goal
Connect a user's Printify account by accepting a Personal Access Token (PAT), validating it, and storing it encrypted so the platform can read orders, products, and fulfillment data.

## Inputs
- `user_id`: Supabase auth user ID
- `token`: Printify Personal Access Token (user pastes from Printify > Settings > Connections)

## Tools
- `execution/token_manager.py` -- Encrypt/decrypt/store tokens in Supabase `connected_accounts`
- `execution/printify_client.py` -- Printify API v1/v2 wrapper

## Steps
1. **User navigates** to "Connect Printify" in the onboarding wizard or settings page.
2. **User pastes** their Printify Personal Access Token into the input field.
3. **Validate token** by calling:
   ```
   GET https://api.printify.com/v2/shops.json
   Authorization: Bearer <token>
   ```
   - If 200: token is valid. Parse the response to get the list of shops.
   - If 401/403: token is invalid or revoked. Return an error: "Invalid token. Please check your Printify Personal Access Token and try again."
   - If 429: rate limited. Return: "Printify is temporarily rate limiting requests. Please try again in a moment."
4. **Select shop**: If the user has multiple Printify shops, prompt them to select which one to connect. For MVP, auto-select the first shop.
5. **Store encrypted token**: Call `token_manager.encrypt_and_store()`:
   ```
   {
     user_id, platform: "printify",
     access_token_enc: encrypt(token),
     refresh_token_enc: null,
     shop_id: <selected_shop_id>,
     shop_name: <shop_title>,
     auth_method: "personal_access_token",
     status: "connected"
   }
   ```
6. **Fetch initial metadata**: Pull shop details (title, sales channel, default print provider) and store in `connected_accounts.metadata` JSONB.
7. **Advance onboarding**: Update `profiles.onboarding_step` to the next step.

## Output
- Row in `connected_accounts` with encrypted Printify PAT, `shop_id`, and metadata.
- User redirected to next onboarding step or dashboard.

## Notes / Edge Cases
- **No OAuth**: Printify does not offer OAuth for third-party apps. Personal Access Tokens are the only authentication method.
- **Tokens do not expire**: Printify PATs are long-lived. However, users can revoke them at any time from Printify settings.
- **Token revocation detection**: If any API call returns 401, mark the account as `status: "disconnected"` and notify the user to reconnect.
- **Rate limits**: Printify API has rate limits (varies by endpoint). Respect `Retry-After` headers. The sync orchestrator should account for this.
- **Multiple shops**: Printify users can have multiple shops (e.g., one connected to Etsy, one to Shopify). Store the specific `shop_id` the user selects.
- **Security**: Never log or display the raw token after initial validation. Only store the encrypted version.
- **Re-connection**: If a user wants to update their token, validate the new token first, then overwrite the encrypted value. Do not delete the old record (preserve audit trail via `updated_at`).
