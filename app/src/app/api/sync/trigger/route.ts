import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { platform, jobType } = await request.json() as {
    platform?: string
    jobType?: string
  }

  // Queue sync jobs for the user
  const jobs: Array<{ user_id: string; job_type: string; priority: number }> = []

  if (jobType) {
    jobs.push({ user_id: user.id, job_type: jobType, priority: 5 })
  } else if (platform) {
    const types: Record<string, string[]> = {
      etsy: ['etsy_orders', 'etsy_listings', 'etsy_payments'],
      shopify: ['shopify_orders', 'shopify_products', 'shopify_customers'],
      printify: ['printify_orders', 'printify_products'],
    }
    for (const type of types[platform] ?? []) {
      jobs.push({ user_id: user.id, job_type: type, priority: 5 })
    }
  } else {
    // Sync all connected platforms
    const { data: accounts } = await supabase
      .from('connected_accounts')
      .select('platform')
      .eq('user_id', user.id)
      .eq('status', 'connected')

    for (const account of accounts ?? []) {
      const types: Record<string, string[]> = {
        etsy: ['etsy_orders', 'etsy_listings'],
        shopify: ['shopify_orders', 'shopify_products'],
        printify: ['printify_orders', 'printify_products'],
      }
      for (const type of types[account.platform] ?? []) {
        jobs.push({ user_id: user.id, job_type: type, priority: 5 })
      }
    }
  }

  if (jobs.length > 0) {
    const { error } = await supabase.from('sync_jobs').insert(jobs)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ queued: jobs.length })
}
