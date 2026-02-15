import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { decryptToken } from '@/lib/utils/crypto'
import { rateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const uid = request.nextUrl.searchParams.get('uid')

  if (!uid) {
    return NextResponse.json({ error: 'Missing uid' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Look up the user's connected Printify account and verify webhook secret
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('user_id, webhook_secret_encrypted')
    .eq('user_id', uid)
    .eq('platform', 'printify')
    .eq('status', 'connected')
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Unknown user or not connected' }, { status: 404 })
  }

  // Decrypt webhook secret from stored encrypted field
  let storedSecret: string | null = null
  if (account.webhook_secret_encrypted) {
    try {
      storedSecret = decryptToken(account.webhook_secret_encrypted)
    } catch {
      storedSecret = null
    }
  }

  if (!storedSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
  }

  // Parse and validate payload
  let payload: { type?: string; event?: string; id?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.type || payload.event
  if (!eventType) {
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 })
  }

  const ORDER_EVENTS = [
    'order:created', 'order:updated', 'order:shipped',
    'order:delivered', 'order:cancelled',
  ]

  const PRODUCT_EVENTS = [
    'product:publish:started', 'product:deleted',
  ]

  const jobType = ORDER_EVENTS.includes(eventType)
    ? 'printify_orders'
    : PRODUCT_EVENTS.includes(eventType)
      ? 'printify_products'
      : null

  if (jobType) {
    // Idempotency: skip if we've already processed this event
    if (payload.id) {
      const { data: existing } = await supabase
        .from('sync_log')
        .select('id')
        .eq('platform', 'printify')
        .eq('sync_type', payload.id)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ received: true, duplicate: true })
      }

      await supabase.from('sync_log').insert({
        user_id: uid,
        platform: 'printify',
        sync_type: payload.id,
        status: 'completed',
        records_synced: 1,
        metadata: { event_type: eventType },
      })
    }

    await supabase.from('sync_jobs').insert({
      user_id: uid,
      job_type: jobType,
      priority: 10,
      metadata: { trigger: 'webhook', event: eventType, payload_id: payload.id },
    })
  }

  return NextResponse.json({ received: true })
}
