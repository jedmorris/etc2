/**
 * Simple in-memory sliding window rate limiter.
 * No external dependencies — uses a Map<string, number[]> with TTL cleanup.
 */

const hits = new Map<string, number[]>()

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  const cutoff = now - windowMs
  for (const [key, timestamps] of hits) {
    const valid = timestamps.filter((t) => t > cutoff)
    if (valid.length === 0) {
      hits.delete(key)
    } else {
      hits.set(key, valid)
    }
  }
}

/**
 * Check if a request should be rate-limited.
 *
 * @param key - Unique identifier (e.g., IP address)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds (default: 60_000 = 1 min)
 * @returns true if the request is ALLOWED, false if rate-limited
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): boolean {
  cleanup(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs
  const timestamps = hits.get(key) || []

  // Remove expired entries
  const valid = timestamps.filter((t) => t > cutoff)

  if (valid.length >= limit) {
    return false // Rate limited
  }

  valid.push(now)
  hits.set(key, valid)
  return true // Allowed
}
