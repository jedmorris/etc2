import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function GET() {
  let dbStatus: 'ok' | 'error' = 'error'

  try {
    const supabase = getServiceClient()
    const { error } = await supabase.from('profiles').select('user_id').limit(1)
    dbStatus = error ? 'error' : 'ok'
  } catch {
    dbStatus = 'error'
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded'

  return NextResponse.json({
    status,
    db: dbStatus,
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  })
}
