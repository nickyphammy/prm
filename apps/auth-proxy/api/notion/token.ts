import { exchangeWithNotion, readConfig, type TokenRequest } from '../../lib/notion.js'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/**
 * Exchanges an authorization code (or refresh token) for Notion tokens using
 * the client secret, which never ships in the desktop app. Nothing is stored.
 */
export async function POST(request: Request): Promise<Response> {
  const config = readConfig(process.env)
  if (!config) return json(500, { error: 'server_misconfigured' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const input = body as Partial<Record<'code' | 'refresh_token', unknown>>
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
  if (result.body['error'] === 'invalid_client') {
    // Diagnostics for a credentials mismatch. The client ID is public (it appears in the authorize URL);
    // only the secret's shape is logged, never its value.
    console.warn('[notion] invalid_client', {
      clientId: config.clientId,
      secretLength: config.clientSecret.length,
      secretHasQuotes: /["']/.test(config.clientSecret),
    })
  }
  return json(result.status, result.body)
}
