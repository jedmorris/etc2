import { stripe } from './client'
import { PLANS, type PlanId } from './plans'

export async function reportUsage(customerId: string, quantity: number) {
  // Stripe v2 Billing Meters API for metered usage reporting
  return stripe.billing.meterEvents.create({
    event_name: 'order_sync',
    payload: {
      stripe_customer_id: customerId,
      value: String(quantity),
    },
  })
}

export function isOverLimit(plan: PlanId, currentCount: number): boolean {
  return currentCount >= PLANS[plan].maxOrders
}

export function getOverageCount(plan: PlanId, currentCount: number): number {
  const limit = PLANS[plan].maxOrders
  return Math.max(0, currentCount - limit)
}
