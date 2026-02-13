import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // Store code verifier in a cookie for the callback
  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ETSY_API_KEY!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/callback/etsy`,
    scope: 'transactions_r listings_r email_r profile_r shops_r',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const etsyAuthUrl = `https://www.etsy.com/oauth/connect?${params.toString()}`

  const response = NextResponse.redirect(etsyAuthUrl)
  response.cookies.set('etsy_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  response.cookies.set('etsy_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
