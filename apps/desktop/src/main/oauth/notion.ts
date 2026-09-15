import { AuthRevokedError, HttpError } from '../errors'
import type { FetchFn } from '../http'

export interface NotionTokens {
  accessToken: string
  refreshToken: string | null
}

export interface NotionConnection {
  tokens: NotionTokens
  workspaceId: string
  workspaceName: string
}

/**
 * State carries the loopback port so the stateless auth proxy knows where to
 * send the browser back to. The proxy only ever redirects to 127.0.0.1.
 */
export function encodeNotionState(port: number, nonce: string): string {
  return `${port}.${nonce}`
}

export function buildNotionAuthUrl(opts: {
  clientId: string
  proxyUrl: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: `${opts.proxyUrl}/api/notion/callback`,
    response_type: 'code',
    owner: 'user',
    state: opts.state,
  })
  return `https://api.notion.com/v1/oauth/authorize?${params}`
}

interface ProxyTokenResponse {
  access_token: string
  refresh_token?: string | null
  workspace_id: string
  workspace_name: string | null
}

async function callProxy(
  proxyUrl: string,
  body: { code: string } | { refresh_token: string },
  fetchFn: FetchFn,
): Promise<NotionConnection> {
  const url = `${proxyUrl}/api/notion/token`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 400 || res.status === 401) {
    const text = await res.text()
    if ('refresh_token' in body) throw new AuthRevokedError()
    throw new HttpError(res.status, text, url)
  }
  if (!res.ok) throw new HttpError(res.status, await res.text(), url)
  const data = (await res.json()) as ProxyTokenResponse
  return {
    tokens: { accessToken: data.access_token, refreshToken: data.refresh_token ?? null },
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name ?? 'Notion workspace',
  }
}

/** The proxy holds the client secret and performs the actual token exchange with Notion. */
export function exchangeNotionCode(
  opts: { proxyUrl: string; code: string },
  fetchFn: FetchFn = fetch,
): Promise<NotionConnection> {
  return callProxy(opts.proxyUrl, { code: opts.code }, fetchFn)
}

export function refreshNotionTokens(
  opts: { proxyUrl: string; refreshToken: string },
  fetchFn: FetchFn = fetch,
): Promise<NotionConnection> {
  return callProxy(opts.proxyUrl, { refresh_token: opts.refreshToken }, fetchFn)
}
