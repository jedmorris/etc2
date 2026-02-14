export type PlanId = 'free' | 'starter' | 'growth' | 'pro'

export interface PlanConfig {
  name: string
  price: number
  maxOrders: number
  syncIntervalMin: number
  historyDays: number
  features: readonly string[]
  stripePriceId: string | null
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    name: 'Free',
    price: 0,
    maxOrders: 50,
    syncIntervalMin: 30,
    historyDays: 30,
    features: ['dashboard', 'basic_kpis', 'orders'],
    stripePriceId: null,
  },
  starter: {
    name: 'Starter',
    price: 1900,
    maxOrders: 300,
    syncIntervalMin: 15,
    historyDays: 90,
    features: ['dashboard', 'basic_kpis', 'orders', 'financials', 'products', 'csv_export'],
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID ?? null,
  },
  growth: {
    name: 'Growth',
    price: 4900,
    maxOrders: 1500,
    syncIntervalMin: 5,
    historyDays: -1,
    features: ['dashboard', 'basic_kpis', 'orders', 'financials', 'products', 'csv_export', 'crm', 'rfm', 'bestsellers', 'fulfillment', 'webhooks', 'newsletter'],
    stripePriceId: process.env.STRIPE_GROWTH_PRICE_ID ?? null,
  },
  pro: {
    name: 'Pro',
    price: 9900,
    maxOrders: 5000,
    syncIntervalMin: 2,
    historyDays: -1,
    features: ['*'],
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
  },
} as const

export function hasFeature(plan: PlanId, feature: string): boolean {
  const config = PLANS[plan]
  return config.features.includes('*') || config.features.includes(feature)
}

export function getPlanByPriceId(priceId: string): PlanId | null {
  for (const [id, config] of Object.entries(PLANS)) {
    if (config.stripePriceId === priceId) return id as PlanId
  }
  return null
}

export const OVERAGE_RATE_CENTS = 2 // $0.02 per order over limit
