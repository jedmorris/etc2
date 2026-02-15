import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/app'
  // Prevent open redirect: must be a relative path, not protocol-relative
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
