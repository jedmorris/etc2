import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the server supabase client
const mockGetUser = vi.fn()
const mockUpdate = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          update: (data: Record<string, unknown>) => {
            mockUpdate(data)
            return { eq: () => ({}) }
          },
        }
      }
      if (table === 'sync_jobs') {
        return {
          insert: (data: unknown) => {
            mockInsert(data)
            return {}
          },
        }
      }
      return {}
    },
  }),
}))

// Import after mocks are set up
const { POST } = await import('./route')

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(makeRequest({ platforms: ['etsy'] }))
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 200 and queues jobs for valid platforms', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })

    const response = await POST(makeRequest({ platforms: ['printify'] }))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    // printify: printify_orders, printify_products (2 sync) + backfill_printify (1) = 3
    expect(body.jobs_queued).toBe(3)

    // Verify profile was updated
    expect(mockUpdate).toHaveBeenCalledWith({
      onboarding_completed: true,
      onboarding_step: 'complete',
      backfill_status: 'pending',
    })

    // Verify jobs were inserted
    expect(mockInsert).toHaveBeenCalled()
  })

  it('handles empty platforms array', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })

    const response = await POST(makeRequest({ platforms: [] }))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.jobs_queued).toBe(0)

    // No jobs should be inserted
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
