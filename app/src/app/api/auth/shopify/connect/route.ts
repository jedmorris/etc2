import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shop = request.nextUrl.searchParams.get('shop')
  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const scopes = 'read_orders,read_products,read_customers'

  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY!,
    scope: scopes,
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI!,
    state,
  })

  const shopifyAuthUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`

  const response = NextResponse.redirect(shopifyAuthUrl)
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set('shopify_shop', shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
