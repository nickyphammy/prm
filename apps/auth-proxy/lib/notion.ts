export interface ProxyConfig {
  clientId: string
  clientSecret: string
  /** Must exactly match the redirect URI registered on the Notion integration. Defaults to this deployment's origin. */
  redirectUri?: string
}

export type TokenRequest =
  | { grant_type: 'authorization_code'; code: string }
  | { grant_type: 'refresh_token'; refresh_token: string }

export function readConfig(env: Record<string, string | undefined>): ProxyConfig | null {
  // Trim: values pasted into a dashboard often pick up stray whitespace, which Notion rejects as invalid_client.
  const clientId = env['NOTION_CLIENT_ID']?.trim()
  const clientSecret = env['NOTION_CLIENT_SECRET']?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri: env['NOTION_REDIRECT_URI']?.trim() || undefined }
}

/** state = "<port>.<nonce>"; the port must be a non-privileged TCP port. */
export function parseLoopbackPort(state: string): number | null {
  const match = /^(\d{4,5})\.[A-Za-z0-9_-]{16,}$/.exec(state)
  if (!match) return null
  const port = Number(match[1])
  return port >= 1024 && port <= 65535 ? port : null
}

/** Fields the desktop app needs; owner details (email, avatar) are deliberately dropped. */
const FORWARDED_FIELDS = [
  'access_token',
  'refresh_token',
  'workspace_id',
  'workspace_name',
  'workspace_icon',
  'bot_id',
] as const

export async function exchangeWithNotion(
  request: TokenRequest,
  config: ProxyConfig & { redirectUri: string },
  fetchFn: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const payload =
    request.grant_type === 'authorization_code'
      ? { ...request, redirect_uri: config.redirectUri }
      : request

  const res = await fetchFn('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    // Pass Notion's error code through (e.g. invalid_grant) but never echo anything else.
    return {
      status: res.status === 401 ? 401 : 400,
      body: { error: data['error'] ?? 'token_exchange_failed' },
    }
  }
  const body: Record<string, unknown> = {}
  for (const field of FORWARDED_FIELDS) body[field] = data[field] ?? null
  return { status: 200, body }
}
