import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'
import { rateLimit } from '@/lib/rate-limit'

const PLATFORM_JOB_TYPES: Record<string, string[]> = {
  etsy: ['etsy_orders', 'etsy_listings', 'etsy_payments'],
  shopify: ['shopify_orders', 'shopify_products', 'shopify_customers'],
  printify: ['printify_orders', 'printify_products'],
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!rateLimit(user.id, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: { platforms?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const platforms = body.platforms ?? []

  // Update profile: mark onboarding complete, set backfill pending
  await supabase.from('profiles').update({
    onboarding_completed: true,
    onboarding_step: 'complete',
    backfill_status: 'pending',
  }).eq('user_id', user.id)

  // Insert initial sync jobs for each connected platform
  const jobs: Array<{
    user_id: string
    job_type: string
    priority: number
    metadata: Json
  }> = []

  for (const platform of platforms) {
    const jobTypes = PLATFORM_JOB_TYPES[platform]
    if (!jobTypes) continue

    for (const jobType of jobTypes) {
      jobs.push({
        user_id: user.id,
        job_type: jobType,
        priority: 10, // High priority for initial sync
        metadata: { is_initial: true } as Json,
      })
    }
  }

  // Also schedule backfill jobs
  for (const platform of platforms) {
    if (PLATFORM_JOB_TYPES[platform]) {
      jobs.push({
        user_id: user.id,
        job_type: `backfill_${platform}`,
        priority: 5,
        metadata: { is_backfill: true } as Json,
      })
    }
  }

  if (jobs.length > 0) {
    await supabase.from('sync_jobs').insert(jobs)
  }

  return NextResponse.json({ ok: true, jobs_queued: jobs.length })
}
