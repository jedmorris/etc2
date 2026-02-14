import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')
  const isDashboard = request.nextUrl.pathname.startsWith('/app')

  if (!user && isDashboard) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  // Redirect to onboarding if user hasn't completed it
  // Skip check if already on the onboarding page or API routes
  const isOnboarding = request.nextUrl.pathname.startsWith('/app/onboarding')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (user && isDashboard && !isOnboarding && !isApiRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile && !profile.onboarding_completed) {
      const url = request.nextUrl.clone()
      url.pathname = '/app/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
