import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeatureGate } from './FeatureGate'

describe('FeatureGate', () => {
  it('renders children when feature is allowed', () => {
    render(
      <FeatureGate feature="dashboard" plan="free" featureLabel="Dashboard">
        <div>Dashboard Content</div>
      </FeatureGate>
    )
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
  })

  it('renders upgrade prompt when feature is blocked', () => {
    render(
      <FeatureGate feature="insights" plan="free" featureLabel="Insights Dashboard">
        <div>Should Not Show</div>
      </FeatureGate>
    )
    expect(screen.queryByText('Should Not Show')).not.toBeInTheDocument()
    expect(screen.getByText('Insights Dashboard')).toBeInTheDocument()
    expect(screen.getByText(/requires the Growth plan/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upgrade to Growth/ })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    )
  })

  it('pro plan always renders children', () => {
    render(
      <FeatureGate feature="insights" plan="pro" featureLabel="Insights Dashboard">
        <div>Pro Content</div>
      </FeatureGate>
    )
    expect(screen.getByText('Pro Content')).toBeInTheDocument()
  })

  it('uses custom requiredPlan label', () => {
    render(
      <FeatureGate
        feature="financials"
        plan="free"
        featureLabel="Financial Reports"
        requiredPlan="Starter"
      >
        <div>Content</div>
      </FeatureGate>
    )
    expect(screen.getByText(/requires the Starter plan/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Upgrade to Starter/ })).toBeInTheDocument()
  })
})
