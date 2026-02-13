# Add Webhook

## Goal
Register a new Modal webhook endpoint, wire it to a directive, deploy, and verify.

## Inputs
- `slug`: URL-safe identifier for the webhook (e.g. `stripe-events`, `etsy-push`)
- `description`: One-line purpose
- `directive_name`: Name of the new directive this webhook serves

## Tools
- `execution/modal_app.py` -- Modal app definition; all webhooks live here
- `execution/webhooks.json` -- Slug-to-directive mapping

## Steps
1. **Read this directive** to confirm the process.
2. **Create the new directive** at `directives/<directive_name>.md` following the standard SOP template (Goal, Inputs, Tools, Steps, Output, Notes).
3. **Add handler logic** to `execution/modal_app.py`:
   - Define a new `@app.function()` with `@modal.web_endpoint(method="POST")` (or GET if read-only).
   - The handler should parse the request, look up the slug in `webhooks.json`, and route to the appropriate execution script.
4. **Map the slug** in `execution/webhooks.json`:
   ```json
   {
     "<slug>": {
       "directive": "<directive_name>",
       "handler": "<function_name_in_modal_app>",
       "method": "POST",
       "description": "<description>"
     }
   }
   ```
5. **Deploy**:
   ```bash
   modal deploy execution/modal_app.py
   ```
6. **Test** the endpoint:
   ```bash
   curl -X POST https://<workspace>--etc2-<slug>.modal.run \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```
7. **Verify** the response and check Modal logs for errors.

## Output
- New directive file in `directives/`
- Updated `execution/webhooks.json`
- Live endpoint at `https://<workspace>--etc2-<slug>.modal.run`

## Notes / Edge Cases
- Always deploy from the project root so Modal picks up `.env` and `execution/` imports.
- If a slug already exists in `webhooks.json`, confirm overwrite before proceeding.
- Endpoint URL pattern: `https://<workspace>--<app>-<func>.modal.run`.
- Activity events should stream to Slack if the Slack integration is configured.
- For webhooks that receive external platform events (Stripe, Etsy), verify signatures before processing.
