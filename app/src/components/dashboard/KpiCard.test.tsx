import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from './KpiCard'

describe('KpiCard', () => {
  it('renders title and value', () => {
    render(<KpiCard title="Revenue" value="$1,234" />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('$1,234')).toBeInTheDocument()
  })

  it('shows positive change indicator', () => {
    render(<KpiCard title="Orders" value="42" change={12.5} changeLabel="vs last month" />)
    expect(screen.getByText('+12.5%')).toBeInTheDocument()
    expect(screen.getByText('vs last month')).toBeInTheDocument()
  })

  it('shows negative change indicator', () => {
    render(<KpiCard title="AOV" value="$50" change={-8.3} />)
    expect(screen.getByText('-8.3%')).toBeInTheDocument()
  })

  it('handles missing optional props', () => {
    render(<KpiCard title="Metric" value="100" />)
    expect(screen.getByText('Metric')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    // No change indicator should be rendered
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })
})
