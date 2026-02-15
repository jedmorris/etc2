import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { stripe } from '@/lib/stripe/client'
import { PLANS, type PlanId, getPlanByPriceId } from '@/lib/stripe/plans'
import { createServerClient } from '@supabase/ssr'
import { rateLimit } from '@/lib/rate-limit'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'alerts@etc2.com'

// Use service role to bypass RLS for webhook processing
function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

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

  // Idempotency: skip if we've already processed this event
  const { data: existing } = await supabase
    .from('sync_log')
    .select('id')
    .eq('platform', 'stripe')
    .eq('sync_type', event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Log this event as processed
  await supabase.from('sync_log').insert({
    user_id: '00000000-0000-0000-0000-000000000000', // system-level event
    platform: 'stripe',
    sync_type: event.id,
    status: 'completed',
    records_synced: 1,
    metadata: { event_type: event.type },
  })

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
        monthly_order_limit: PLANS[plan as PlanId]?.maxOrders ?? PLANS.free.maxOrders,
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
        monthly_order_limit: PLANS[plan as PlanId]?.maxOrders ?? PLANS.free.maxOrders,
      }).eq('stripe_subscription_id', subscription.id)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      await supabase.from('profiles').update({
        plan: 'free',
        plan_status: 'cancelled',
        monthly_order_limit: PLANS.free.maxOrders,
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
        const { data: failedProfile } = await supabase.from('profiles')
          .select('user_id, email')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (failedProfile) {
          await supabase.from('profiles').update({
            plan_status: 'past_due',
          }).eq('user_id', failedProfile.user_id)

          // Send payment failure email
          if (resend && failedProfile.email) {
            try {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: [failedProfile.email],
                subject: '[etC2] Payment failed — update billing',
                html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Payment Failed</h2>
                  <p>We were unable to process your most recent payment.</p>
                  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="color: #991b1b; margin: 0; font-size: 14px;">
                      Your syncs may be paused until billing is resolved.
                      Please update your payment method to avoid service interruption.
                    </p>
                  </div>
                  <a href="https://app.etc2.com/app/settings"
                     style="display: inline-block; background: #18181b; color: white; padding: 12px 24px;
                            border-radius: 6px; text-decoration: none; margin-top: 16px;">
                    Update Billing
                  </a>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                  <p style="font-size: 12px; color: #9ca3af;">etC2 - POD Analytics for Etsy Sellers</p>
                </div>`,
              })
            } catch {
              // Non-blocking — payment status already updated
            }
          }
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
