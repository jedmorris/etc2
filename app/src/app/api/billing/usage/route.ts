import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, monthly_order_count, monthly_order_limit')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json({
    plan: profile.plan,
    used: profile.monthly_order_count,
    limit: profile.monthly_order_limit,
    remaining: Math.max(0, profile.monthly_order_limit - profile.monthly_order_count),
    overageCount: Math.max(0, profile.monthly_order_count - profile.monthly_order_limit),
  })
}
