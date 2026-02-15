import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatCents,
  formatNumber,
  formatPercent,
  formatDate,
  formatRelativeTime,
  truncate,
} from './format'

describe('formatCents', () => {
  it('formats positive cents to dollars', () => {
    expect(formatCents(1999)).toBe('$19.99')
  })

  it('formats zero cents', () => {
    expect(formatCents(0)).toBe('$0.00')
  })

  it('formats negative cents', () => {
    expect(formatCents(-500)).toBe('-$5.00')
  })
})

describe('formatNumber', () => {
  it('formats numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('formats small numbers without commas', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('formats decimals', () => {
    expect(formatNumber(3.14)).toBe('3.14')
  })
})

describe('formatPercent', () => {
  it('formats positive percent', () => {
    expect(formatPercent(12.345)).toBe('12.3%')
  })

  it('formats negative percent', () => {
    expect(formatPercent(-5.67)).toBe('-5.7%')
  })

  it('formats zero', () => {
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('respects custom decimals', () => {
    expect(formatPercent(12.345, 2)).toBe('12.35%')
  })
})

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2025-06-15T12:00:00Z')
    expect(result).toContain('Jun')
    expect(result).toContain('15')
    expect(result).toContain('2025')
  })

  it('formats a Date object', () => {
    const result = formatDate(new Date('2025-06-15T12:00:00Z'))
    expect(result).toContain('2025')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for very recent', () => {
    expect(formatRelativeTime('2025-06-15T12:00:00Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(formatRelativeTime('2025-06-15T11:55:00Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(formatRelativeTime('2025-06-15T09:00:00Z')).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(formatRelativeTime('2025-06-13T12:00:00Z')).toBe('2d ago')
  })
})

describe('truncate', () => {
  it('returns string as-is if under limit', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates string over limit with ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('returns string as-is at exact limit', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
})
