import { describe, it, expect } from 'vitest'
import { hasFeature, getPlanByPriceId, PLANS, type PlanId } from './plans'

describe('hasFeature', () => {
  it('free plan has dashboard access', () => {
    expect(hasFeature('free', 'dashboard')).toBe(true)
  })

  it('free plan does not have insights', () => {
    expect(hasFeature('free', 'insights')).toBe(false)
  })

  it('free plan does not have crm', () => {
    expect(hasFeature('free', 'crm')).toBe(false)
  })

  it('starter plan has financials', () => {
    expect(hasFeature('starter', 'financials')).toBe(true)
  })

  it('starter plan does not have insights', () => {
    expect(hasFeature('starter', 'insights')).toBe(false)
  })

  it('growth plan has insights', () => {
    expect(hasFeature('growth', 'insights')).toBe(true)
  })

  it('pro plan has wildcard — any feature returns true', () => {
    expect(hasFeature('pro', 'anything')).toBe(true)
    expect(hasFeature('pro', 'insights')).toBe(true)
    expect(hasFeature('pro', 'nonexistent_feature')).toBe(true)
  })
})

describe('getPlanByPriceId', () => {
  it('returns null for unknown price ID', () => {
    expect(getPlanByPriceId('price_unknown')).toBeNull()
  })

  it('returns null for free plan (no price ID)', () => {
    expect(getPlanByPriceId('')).toBeNull()
  })
})

describe('PLANS', () => {
  const planIds: PlanId[] = ['free', 'starter', 'growth', 'pro']

  it('all plans have required fields', () => {
    for (const id of planIds) {
      const plan = PLANS[id]
      expect(plan.name).toBeTruthy()
      expect(typeof plan.price).toBe('number')
      expect(typeof plan.maxOrders).toBe('number')
      expect(typeof plan.syncIntervalMin).toBe('number')
      expect(typeof plan.historyDays).toBe('number')
      expect(Array.isArray(plan.features)).toBe(true)
      expect(plan.features.length).toBeGreaterThan(0)
    }
  })

  it('plans are ordered by price ascending', () => {
    expect(PLANS.free.price).toBeLessThan(PLANS.starter.price)
    expect(PLANS.starter.price).toBeLessThan(PLANS.growth.price)
    expect(PLANS.growth.price).toBeLessThan(PLANS.pro.price)
  })

  it('free plan has no stripe price ID', () => {
    expect(PLANS.free.stripePriceId).toBeNull()
  })
})
