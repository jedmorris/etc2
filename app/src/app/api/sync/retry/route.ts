import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await request.json() as { jobId?: string }

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  // Find the original failed job
  const { data: originalJob } = await supabase
    .from('sync_jobs')
    .select('job_type, user_id')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!originalJob) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Create a new sync job with the same type
  const { data: newJob, error } = await supabase
    .from('sync_jobs')
    .insert({
      user_id: user.id,
      job_type: originalJob.job_type,
      priority: 5,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ jobId: newJob.id })
}
