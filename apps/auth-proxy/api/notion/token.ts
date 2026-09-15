import { json, readJsonObject, tooManyRequests } from '../../lib/http.js'
import { exchangeWithNotion, readConfig, type TokenRequest } from '../../lib/notion.js'
import { clientKey, createRateLimiter } from '../../lib/rate-limit.js'

// A person connects or refreshes a handful of times; 20 per 10 minutes per IP leaves plenty of headroom.
const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 })

/**
 * Exchanges an authorization code (or refresh token) for Notion tokens using
 * the client secret, which never ships in the desktop app. Nothing is stored.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = limiter(clientKey(request))
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec)

  const config = readConfig(process.env)
  if (!config) return json(500, { error: 'server_misconfigured' })

  const input = await readJsonObject(request)
  if (!input) return json(400, { error: 'invalid_json' })

  let tokenRequest: TokenRequest
  if (typeof input.code === 'string' && input.code.length > 0 && input.code.length < 512) {
    tokenRequest = { grant_type: 'authorization_code', code: input.code }
  } else if (
    typeof input.refresh_token === 'string' &&
    input.refresh_token.length > 0 &&
    input.refresh_token.length < 2048
  ) {
    tokenRequest = { grant_type: 'refresh_token', refresh_token: input.refresh_token }
  } else {
    return json(400, { error: 'expected code or refresh_token' })
  }

  const redirectUri = config.redirectUri ?? `${new URL(request.url).origin}/api/notion/callback`
  const result = await exchangeWithNotion(tokenRequest, { ...config, redirectUri }, fetch)
  return json(result.status, result.body)
}
