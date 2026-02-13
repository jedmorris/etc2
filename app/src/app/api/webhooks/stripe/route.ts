import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { getPlanByPriceId } from '@/lib/stripe/plans'
import { createServerClient } from '@supabase/ssr'

// Use service role to bypass RLS for webhook processing
function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  const supabase = getServiceClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = session.metadata?.user_id
      if (!userId) break

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
      const priceId = subscription.items.data[0]?.price.id
      const plan = getPlanByPriceId(priceId) ?? 'free'

      await supabase.from('profiles').update({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        plan,
        plan_status: 'active',
        monthly_order_limit: plan === 'starter' ? 300 : plan === 'growth' ? 1500 : plan === 'pro' ? 5000 : 50,
      }).eq('user_id', userId)
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const priceId = subscription.items.data[0]?.price.id
      const plan = getPlanByPriceId(priceId) ?? 'free'

      await supabase.from('profiles').update({
        plan,
        plan_status: subscription.status === 'active' ? 'active' : 'past_due',
        monthly_order_limit: plan === 'starter' ? 300 : plan === 'growth' ? 1500 : plan === 'pro' ? 5000 : 50,
      }).eq('stripe_subscription_id', subscription.id)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      await supabase.from('profiles').update({
        plan: 'free',
        plan_status: 'cancelled',
        monthly_order_limit: 50,
      }).eq('stripe_subscription_id', subscription.id)
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : (invoice as unknown as Record<string, unknown>).subscription as string | null
      if (subscriptionId) {
        // Reset monthly order count on successful payment
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (profile) {
          await supabase.rpc('reset_monthly_counts', { p_user_id: profile.user_id })
        }
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = typeof invoice.parent?.subscription_details?.subscription === 'string'
        ? invoice.parent.subscription_details.subscription
        : (invoice as unknown as Record<string, unknown>).subscription as string | null
      if (subscriptionId) {
        await supabase.from('profiles').update({
          plan_status: 'past_due',
        }).eq('stripe_subscription_id', subscriptionId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
