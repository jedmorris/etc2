import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { PLANS, type PlanId } from '@/lib/stripe/plans'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { planId, redirectUrl } = await request.json() as { planId: PlanId; redirectUrl?: string }
  const plan = PLANS[planId]

  if (!plan || !plan.stripePriceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('user_id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || user.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id

    await supabase.from('profiles').update({
      stripe_customer_id: customerId,
    }).eq('user_id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      { price: plan.stripePriceId, quantity: 1 },
    ],
    success_url: redirectUrl
      ? `${process.env.NEXT_PUBLIC_APP_URL}${redirectUrl}?checkout=success`
      : `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/billing?success=true`,
    cancel_url: redirectUrl
      ? `${process.env.NEXT_PUBLIC_APP_URL}${redirectUrl}?checkout=cancelled`
      : `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/billing?cancelled=true`,
    metadata: { user_id: user.id },
    subscription_data: {
      metadata: { user_id: user.id },
    },
  })

  return NextResponse.json({ url: session.url })
}
