# Newsletter Subscriber Sync (Beehiiv → Substack)

## Goal
Automatically forward new Beehiiv subscribers to Substack, sync unsubscribe events bidirectionally, and maintain a single source of truth for subscriber state.

**Strategy:** Beehiiv handles subscriber intake (signup forms, tags, segments). Substack handles weekly newsletter distribution (leveraging platform reach). Both platforms stay in sync.

## Inputs
- Beehiiv webhook events: `subscriber.created`, `subscriber.unsubscribed`
- Beehiiv API key + Publication ID
- Substack publication URL

## Tools
- `execution/beehiiv_client.py` — Beehiiv API v2 wrapper (subscribers, tags, webhook verification)
- `execution/substack_client.py` — Substack subscribe endpoint (forward new subscribers)
- `execution/newsletter_sync.py` — Orchestration (webhook handlers, retry, reconciliation)
- `execution/modal_app.py` — Webhook endpoint + scheduled jobs

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Subscriber Signup                      │
│              (Beehiiv form / landing page)                │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                     BEEHIIV                               │
│  • Captures subscriber email                             │
│  • Applies tags & segments                               │
│  • Fires webhook: subscriber.created                     │
└──────────────────────┬───────────────────────────────────┘
                       │ POST webhook
                       ▼
┌──────────────────────────────────────────────────────────┐
│              MODAL WEBHOOK ENDPOINT                       │
│           beehiiv_subscriber_webhook()                    │
│                                                          │
│  1. Verify HMAC signature                                │
│  2. Route by event type:                                 │
│     • subscriber.created → handle_new_subscriber()       │
│     • subscriber.unsubscribed → handle_unsubscribe()     │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              newsletter_sync.py                           │
│                                                          │
│  handle_new_subscriber():                                │
│    1. Upsert to newsletter_subscribers table             │
│    2. POST email to Substack /api/v1/free                │
│    3. Update substack_status (confirmation_sent/failed)  │
│    4. Log to newsletter_sync_log                         │
│                                                          │
│  handle_unsubscribe():                                   │
│    1. Mark beehiiv_status = 'unsubscribed'               │
│    2. Flag substack_status = 'pending_unsub'             │
│    3. Log event (manual Substack removal needed)         │
└──────────────────────────────────────────────────────────┘
```

## Steps

### 1. Configure Beehiiv Webhook
In Beehiiv dashboard → Settings → Webhooks:
- URL: `https://<workspace>--etC2-beehiiv-subscriber-webhook.modal.run`
- Events: `subscriber.created`, `subscriber.unsubscribed`
- Copy the webhook secret → set as `BEEHIIV_WEBHOOK_SECRET` in `.env` and Modal secrets

### 2. Set Environment Variables
Add to `.env` and Modal secrets dashboard:
```
BEEHIIV_API_KEY=your-beehiiv-api-key
BEEHIIV_PUBLICATION_ID=pub_xxxxxxxx
BEEHIIV_WEBHOOK_SECRET=whsec_xxxxxxxx
SUBSTACK_PUBLICATION_URL=https://yourpub.substack.com
NEWSLETTER_OWNER_USER_ID=your-supabase-user-id
```

### 3. Run Database Migration
Execute the `newsletter_subscribers` and `newsletter_sync_log` table creation from `supabase_schema.sql` in Supabase SQL Editor.

### 4. Deploy Modal
```bash
cd /path/to/etC2
modal deploy execution/modal_app.py
```

### 5. Test the Flow
```bash
# Health check
curl https://<workspace>--etC2-health.modal.run

# Simulate a subscriber webhook (use actual Beehiiv test event)
curl -X POST https://<workspace>--etC2-beehiiv-subscriber-webhook.modal.run \
  -H "Content-Type: application/json" \
  -H "X-Beehiiv-Signature: test" \
  -d '{"event": "subscriber.created", "data": {"email": "test@example.com", "id": "sub_test123", "tags": []}}'
```

### 6. Verify
- Check `newsletter_subscribers` table in Supabase
- Check `newsletter_sync_log` for the sync event
- Confirm test email receives Substack confirmation

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `retry_pending_subscribers` | Every 15 min | Retry failed Substack forwards |
| `reconcile_subscribers` | Daily 5 AM | Full Beehiiv ↔ DB comparison |

## Output
- Real-time subscriber sync: Beehiiv signup → Substack confirmation email (~seconds)
- Subscriber state tracked in `newsletter_subscribers` table
- Full audit trail in `newsletter_sync_log`
- Dashboard stats available via `get_subscriber_stats()`

## Platform Limitations & Workarounds

### Substack (no public API)
| Action | Method | Status |
|--------|--------|--------|
| Subscribe new user | POST `/api/v1/free` | Automated (sends confirmation email) |
| Unsubscribe user | No API | Manual via Substack dashboard |
| List subscribers | No API | CSV export from dashboard |
| Detect unsubscribes | No webhooks | Not possible — one-directional |

### Bidirectional Unsub Strategy
- **Beehiiv → Substack:** Webhook fires → we flag `pending_unsub` in DB → batch remove via Substack dashboard
- **Substack → Beehiiv:** Not detectable via API. Periodic manual CSV comparison or accept that Substack may have slightly more subscribers than Beehiiv.

## Notes / Edge Cases
- **Double opt-in:** Subscribers get a Beehiiv welcome email AND a Substack confirmation email. This is actually beneficial — confirms intent on both platforms.
- **Duplicate handling:** The `UNIQUE(user_id, email)` constraint on `newsletter_subscribers` prevents duplicates. Upsert handles re-subscriptions.
- **Rate limiting:** Substack subscribe endpoint is throttled to 1 req/sec in `substack_client.py`. For bulk reconciliation, this means ~360 new forwards per hour.
- **Beehiiv segments:** Stored in the `segments` JSONB column but not currently synced anywhere — available for targeted email campaigns directly via Beehiiv.
- **Self-anneal:** If the Substack endpoint changes or starts requiring CAPTCHA, update `substack_client.py` and note the change here.
