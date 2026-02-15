import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimit } from './rate-limit'

describe('rateLimit', () => {
  beforeEach(() => {
    // Reset module state between tests by advancing time far enough
    vi.useFakeTimers()
  })

  it('allows requests under the limit', () => {
    const key = 'test-under-limit'
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
  })

  it('blocks requests over the limit', () => {
    const key = 'test-over-limit'
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(false)
  })

  it('resets after window expires', () => {
    const key = 'test-reset'
    expect(rateLimit(key, 1, 1_000)).toBe(true)
    expect(rateLimit(key, 1, 1_000)).toBe(false)

    // Advance time past the window
    vi.advanceTimersByTime(1_100)

    expect(rateLimit(key, 1, 1_000)).toBe(true)
  })

  it('handles multiple keys independently', () => {
    const keyA = 'test-key-a'
    const keyB = 'test-key-b'

    expect(rateLimit(keyA, 1, 60_000)).toBe(true)
    expect(rateLimit(keyA, 1, 60_000)).toBe(false)

    // keyB should still be allowed
    expect(rateLimit(keyB, 1, 60_000)).toBe(true)
  })
})
