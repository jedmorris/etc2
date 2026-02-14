import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToken, generateSecret } from '@/lib/utils/crypto'

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
 * The callback URL includes the user_id and a secret for verification.
 */
async function registerPrintifyWebhook(
  shopId: string,
  token: string,
  userId: string,
  webhookSecret: string
): Promise<void> {
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/printify?uid=${userId}&secret=${webhookSecret}`

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
      console.error(`Failed to register Printify webhook ${event}:`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const shop = shops[0] // Use first shop

    if (!shop) {
      return NextResponse.json({ error: 'No Printify shops found' }, { status: 400 })
    }

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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Register webhooks with Printify (fire-and-forget)
    registerPrintifyWebhook(
      String(shop.id),
      token, // Use plaintext token for API call (before it's discarded)
      user.id,
      webhookSecret
    ).catch((err) =>
      console.error('Printify webhook registration failed:', err)
    )

    return NextResponse.json({
      success: true,
      shop: { id: shop.id, name: shop.title },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to validate token' }, { status: 500 })
  }
}
