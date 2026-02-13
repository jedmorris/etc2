import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get connected accounts with last sync info
  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('platform, platform_shop_name, status, last_sync_at, error_message')
    .eq('user_id', user.id)

  // Get recent sync jobs
  const { data: recentJobs } = await supabase
    .from('sync_jobs')
    .select('job_type, status, started_at, completed_at, records_processed, error_message')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get pending job count
  const { count: pendingCount } = await supabase
    .from('sync_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'queued')

  return NextResponse.json({
    accounts: accounts ?? [],
    recentJobs: recentJobs ?? [],
    pendingJobs: pendingCount ?? 0,
  })
}
