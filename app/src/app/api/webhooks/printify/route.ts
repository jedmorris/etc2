import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'
import { decryptToken } from '@/lib/utils/crypto'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

/**
 * Verify the webhook secret matches the one stored for this user.
 * The secret is passed as a query parameter when Printify sends the webhook.
 * This prevents forged webhook events since only Printify knows the secret.
 */
function verifySecret(provided: string | null, stored: string | null): boolean {
  if (!provided || !stored) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'utf8'),
      Buffer.from(stored, 'utf8')
    )
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get('uid')
  const secret = request.nextUrl.searchParams.get('secret')

  if (!uid) {
    return NextResponse.json({ error: 'Missing uid' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Look up the user's connected Printify account and verify webhook secret
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('user_id, webhook_secret_encrypted, sync_cursor')
    .eq('user_id', uid)
    .eq('platform', 'printify')
    .eq('status', 'connected')
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Unknown user or not connected' }, { status: 404 })
  }

  // Decrypt webhook secret from dedicated encrypted field, fallback to legacy sync_cursor
  let storedSecret: string | null = null
  if (account.webhook_secret_encrypted) {
    try {
      storedSecret = decryptToken(account.webhook_secret_encrypted)
    } catch {
      storedSecret = null
    }
  }
  if (!storedSecret) {
    // Legacy fallback: read from sync_cursor (plaintext)
    storedSecret = (account.sync_cursor as Record<string, string> | null)?.webhook_secret ?? null
  }

  if (!verifySecret(secret, storedSecret)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
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

  if (ORDER_EVENTS.includes(eventType)) {
    await supabase.from('sync_jobs').insert({
      user_id: uid,
      job_type: 'printify_orders',
      priority: 10,
      metadata: { trigger: 'webhook', event: eventType, payload_id: payload.id },
    })
  } else if (PRODUCT_EVENTS.includes(eventType)) {
    await supabase.from('sync_jobs').insert({
      user_id: uid,
      job_type: 'printify_products',
      priority: 10,
      metadata: { trigger: 'webhook', event: eventType, payload_id: payload.id },
    })
  }

  return NextResponse.json({ received: true })
}
