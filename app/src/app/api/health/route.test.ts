import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 with correct shape', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
  })

  it('returns status "ok" and valid timestamp', async () => {
    const response = await GET()
    const body = await response.json()

    expect(body.status).toBe('ok')
    expect(new Date(body.timestamp).getTime()).not.toBeNaN()
  })
})
