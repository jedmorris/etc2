import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] })
  }

  try {
    const stripeInvoices = await stripe.invoices.list({
      customer: profile.stripe_customer_id,
      limit: 12,
    })

    const invoices = stripeInvoices.data.map((inv) => ({
      id: inv.id,
      date: new Date((inv.created ?? 0) * 1000).toISOString(),
      amount: inv.amount_paid ?? 0,
      status: inv.status ?? 'unknown',
      url: inv.hosted_invoice_url ?? null,
    }))

    return NextResponse.json({ invoices })
  } catch {
    return NextResponse.json({ invoices: [] })
  }
}
