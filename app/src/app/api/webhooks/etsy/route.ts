import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

/**
 * Verify the Etsy webhook signature (HMAC-SHA256 with base64).
 *
 * Etsy sends three headers:
 *   webhook-id        – unique call ID
 *   webhook-timestamp – unix seconds
 *   webhook-signature – base64(HMAC-SHA256(secret, id.timestamp.body))
 *
 * The signing secret from the Etsy Webhook Portal has a "whsec_" prefix;
 * strip that and base64-decode the remainder to get the raw key bytes.
 */
function verifyEtsySignature(
  body: string,
  webhookId: string,
  timestamp: string,
  signature: string
): boolean {
  const secret = process.env.ETSY_WEBHOOK_SECRET
  if (!secret) return false

  // Reject stale timestamps (> 5 min)
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  // Strip "whsec_" prefix and decode the base64 key
  const keyStr = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Buffer.from(keyStr, 'base64')

  const signedContent = `${webhookId}.${timestamp}.${body}`
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(signedContent, 'utf8')
    .digest('base64')

  // The header may contain multiple sigs separated by spaces — match any
  const signatures = signature.split(' ')
  for (const sig of signatures) {
    // Signatures may be versioned: "v1,<base64>"
    const raw = sig.includes(',') ? sig.split(',')[1] : sig
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(raw))) {
        return true
      }
    } catch {
      continue
    }
  }
  return false
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const webhookId = request.headers.get('webhook-id')
  const timestamp = request.headers.get('webhook-timestamp')
  const signature = request.headers.get('webhook-signature')

  if (!webhookId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  if (!verifyEtsySignature(body, webhookId, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: { event_type?: string; event_id?: string; data?: Record<string, unknown> }
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.event_type
  if (!eventType) {
    return NextResponse.json({ error: 'Missing event_type' }, { status: 400 })
  }

  // Extract shop_id from the event data to look up the user
  const shopId = payload.data?.shop_id as string | number | undefined
  if (!shopId) {
    return NextResponse.json({ error: 'Missing shop_id in event data' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Look up user by Etsy shop ID
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('user_id')
    .eq('platform', 'etsy')
    .eq('platform_shop_id', String(shopId))
    .eq('status', 'connected')
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Unknown shop' }, { status: 404 })
  }

  // Map Etsy events to sync job types
  const EVENT_MAP: Record<string, string> = {
    // Order events
    'order.paid': 'etsy_orders',
    'order.shipped': 'etsy_orders',
    'order.completed': 'etsy_orders',
    'order.refunded': 'etsy_orders',
    'shop.receipt.created': 'etsy_orders',
    'shop.receipt.updated': 'etsy_orders',
    // Listing events
    'listing.active': 'etsy_listings',
    'listing.inactive': 'etsy_listings',
    'listing.updated': 'etsy_listings',
    'listing.created': 'etsy_listings',
    'listing.removed': 'etsy_listings',
    // Payment events
    'payment.completed': 'etsy_payments',
    'shop.payment.completed': 'etsy_payments',
  }

  const jobType = EVENT_MAP[eventType]
  if (jobType) {
    // Avoid duplicate sync jobs for the same event by checking for recent webhook-triggered jobs
    const { data: existing } = await supabase
      .from('sync_jobs')
      .select('id')
      .eq('user_id', account.user_id)
      .eq('job_type', jobType)
      .eq('status', 'queued')
      .limit(1)

    if (!existing?.length) {
      await supabase.from('sync_jobs').insert({
        user_id: account.user_id,
        job_type: jobType,
        priority: 10,
        metadata: {
          trigger: 'webhook',
          event: eventType,
          event_id: payload.event_id,
          resource_url: payload.data?.resource_url,
        },
      })
    }
  }

  return NextResponse.json({ received: true })
}
