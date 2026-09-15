import { describe, expect, it } from 'vitest'
import { clientKey, createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit per window, then reports when to retry', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(check('a', 0)).toEqual({ ok: true })
    expect(check('a', 1_000)).toEqual({ ok: true })
    expect(check('a', 2_000)).toEqual({ ok: false, retryAfterSec: 58 })
    expect(check('b', 2_000)).toEqual({ ok: true })
    expect(check('a', 60_000)).toEqual({ ok: true })
  })

  it('never grows beyond maxKeys', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 })
    for (const key of ['a', 'b', 'c', 'd', 'e']) expect(check(key, 0)).toEqual({ ok: true })
  })
})

describe('clientKey', () => {
  it('prefers x-real-ip, then the first x-forwarded-for hop', () => {
    const req = (headers: Record<string, string>) => new Request('https://x.test', { headers })
    expect(clientKey(req({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientKey(req({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3')
    expect(clientKey(req({}))).toBe('unknown')
  })
})
