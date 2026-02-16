import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToken, generateSecret } from '@/lib/utils/crypto'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const PRINTIFY_API = 'https://api.printify.com/v1'

const WEBHOOK_EVENTS = [
  'order:created',
  'order:updated',
  'order:shipped',
  'order:delivered',
  'order:cancelled',
  'product:publish:started',
  'product:deleted',
]

/**
 * Register a webhook with Printify for this shop.
 * The callback URL includes the user_id for routing.
 */
async function registerPrintifyWebhook(
  shopId: string,
  token: string,
  userId: string
): Promise<void> {
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/printify?uid=${userId}`

  for (const event of WEBHOOK_EVENTS) {
    try {
      await fetch(`${PRINTIFY_API}/shops/${shopId}/webhooks.json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: event,
          url: callbackUrl,
        }),
      })
    } catch (err) {
      logger.error(`Failed to register Printify webhook ${event}:`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!rateLimit(user.id, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { token } = await request.json()
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Validate token by fetching shops
  try {
    const res = await fetch(`${PRINTIFY_API}/shops.json`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Invalid Printify token' }, { status: 400 })
    }

    const shops = await res.json()

    if (!Array.isArray(shops) || shops.length === 0) {
      return NextResponse.json({ error: 'No Printify shops found' }, { status: 400 })
    }

    const shop = shops[0]

    // Encrypt token before storing
    const encryptedToken = encryptToken(token)

    // Generate a webhook secret for verifying incoming webhooks
    const webhookSecret = generateSecret()
    const encryptedWebhookSecret = encryptToken(webhookSecret)

    // Store connection with encrypted token and webhook secret
    const { error } = await supabase
      .from('connected_accounts')
      .upsert({
        user_id: user.id,
        platform: 'printify',
        platform_shop_id: String(shop.id),
        platform_shop_name: shop.title,
        status: 'connected',
        access_token_encrypted: encryptedToken,
        webhook_secret_encrypted: encryptedWebhookSecret,
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,platform',
      })

    if (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Register webhooks with Printify (fire-and-forget)
    registerPrintifyWebhook(
      String(shop.id),
      token, // Use plaintext token for API call (before it's discarded)
      user.id
    ).catch((err) =>
      logger.error('Printify webhook registration failed:', err)
    )

    // Queue initial sync jobs for Printify orders and products
    const now = new Date().toISOString()
    await supabase.from('sync_jobs').insert([
      { user_id: user.id, job_type: 'printify_orders', status: 'queued', scheduled_at: now },
      { user_id: user.id, job_type: 'printify_products', status: 'queued', scheduled_at: now },
    ])

    return NextResponse.json({
      success: true,
      shop: { id: shop.id, name: shop.title },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to validate token' }, { status: 500 })
  }
}
