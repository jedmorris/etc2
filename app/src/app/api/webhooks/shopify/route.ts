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

function verifyShopifyHmac(body: string, hmac: string): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (!secret) return false
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))
  } catch {
    return false
  }
}

// Map webhook topics to sync job types
const TOPIC_MAP: Record<string, string> = {
  'orders/create': 'shopify_orders',
  'orders/updated': 'shopify_orders',
  'orders/paid': 'shopify_orders',
  'orders/fulfilled': 'shopify_orders',
  'orders/cancelled': 'shopify_orders',
  'products/create': 'shopify_products',
  'products/update': 'shopify_products',
  'products/delete': 'shopify_products',
  'customers/create': 'shopify_customers',
  'customers/update': 'shopify_customers',
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shopDomain = request.headers.get('x-shopify-shop-domain')

  if (!hmac || !verifyShopifyHmac(body, hmac)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (!shopDomain || !topic) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Look up user by shop domain
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('user_id')
    .eq('platform', 'shopify')
    .eq('platform_shop_id', shopDomain)
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: 'Unknown shop' }, { status: 404 })
  }

  // Handle app uninstall — disconnect the account
  if (topic === 'app/uninstalled') {
    await supabase
      .from('connected_accounts')
      .update({
        status: 'disconnected',
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        error_message: 'App uninstalled by shop owner',
      })
      .eq('user_id', account.user_id)
      .eq('platform', 'shopify')

    return NextResponse.json({ received: true })
  }

  // Queue a sync job for recognized topics
  const jobType = TOPIC_MAP[topic]
  if (jobType) {
    await supabase.from('sync_jobs').insert({
      user_id: account.user_id,
      job_type: jobType,
      priority: 10,
      metadata: { trigger: 'webhook', topic },
    })
  }

  return NextResponse.json({ received: true })
}
