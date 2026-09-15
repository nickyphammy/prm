/**
 * Fixed-window rate limiter kept in function memory. Vercel may run several
 * instances, so this is best-effort: it stops casual abuse from one client, and
 * a Vercel Firewall rate-limit rule is the place for a hard global limit.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const maxKeys = opts.maxKeys ?? 10_000
  const windows = new Map<string, { start: number; count: number }>()

  return function check(
    key: string,
    now = Date.now(),
  ): { ok: true } | { ok: false; retryAfterSec: number } {
    const current = windows.get(key)
    if (!current || now - current.start >= opts.windowMs) {
      if (windows.size >= maxKeys) {
        // Drop expired windows; if still full, reset rather than grow without bound.
        for (const [k, w] of windows) if (now - w.start >= opts.windowMs) windows.delete(k)
        if (windows.size >= maxKeys) windows.clear()
      }
      windows.set(key, { start: now, count: 1 })
      return { ok: true }
    }
    if (current.count >= opts.limit) {
      return { ok: false, retryAfterSec: Math.ceil((current.start + opts.windowMs - now) / 1000) }
    }
    current.count++
    return { ok: true }
  }
}

/** Client IP as reported by Vercel's edge (x-real-ip is set by Vercel and not spoofable by clients). */
export function clientKey(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}
