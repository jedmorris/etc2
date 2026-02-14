import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = getServiceClient()

  // Delete user data in order (respecting foreign keys)
  // CASCADE on auth.users will clean up profiles and connected_accounts,
  // but we explicitly clear sensitive data first
  const tables = [
    'newsletter_sync_log',
    'newsletter_subscribers',
    'bestseller_candidates',
    'monthly_pnl',
    'daily_financials',
    'platform_fees',
    'fulfillment_events',
    'order_line_items',
    'orders',
    'etsy_listing_stats',
    'products',
    'customer_notes',
    'customers',
    'sync_log',
    'sync_jobs',
    'rate_limit_tracking',
    'connected_accounts',
    'profiles',
  ] as const

  for (const table of tables) {
    await serviceClient
      .from(table)
      .delete()
      .eq('user_id', user.id)
  }

  // Delete the auth user (this is permanent)
  const { error } = await serviceClient.auth.admin.deleteUser(user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
