import { json, readJsonObject, tooManyRequests } from '../../lib/http.js'
import { readConfig, revokeWithNotion } from '../../lib/notion.js'
import { clientKey, createRateLimiter } from '../../lib/rate-limit.js'

const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 })

/**
 * Revokes a Notion token when the user disconnects, so the workspace no longer
 * lists PRM Dashboard as connected. Notion requires the client secret for this too.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = limiter(clientKey(request))
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec)

  const config = readConfig(process.env)
  if (!config) return json(500, { error: 'server_misconfigured' })

  const input = await readJsonObject(request)
  const token = input?.['token']
  if (typeof token !== 'string' || token.length === 0 || token.length >= 2048) {
    return json(400, { error: 'expected token' })
  }

  const result = await revokeWithNotion(token, config, fetch)
  return json(result.status, result.body)
}
