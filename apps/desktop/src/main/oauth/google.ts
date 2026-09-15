import { AuthRevokedError, HttpError } from '../errors'
import { fetchJson, type FetchFn } from '../http'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
]

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/** Refresh this long before expiry so a request never races the deadline. */
const EXPIRY_SKEW_MS = 60_000

export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms. */
  expiresAt: number
  scope: string
}

export interface GoogleClient {
  clientId: string
  clientSecret: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export function buildGoogleAuthUrl(opts: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
    state: opts.state,
    // offline + consent guarantees a refresh token, even when reconnecting.
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${AUTH_URL}?${params}`
}

async function postToken(body: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    const text = await res.text()
    // invalid_grant = refresh token revoked, expired, or the app is still in "Testing" (7-day tokens).
    if (res.status === 400 && text.includes('invalid_grant')) throw new AuthRevokedError()
    throw new HttpError(res.status, text, TOKEN_URL)
  }
  return (await res.json()) as TokenResponse
}

export async function exchangeGoogleCode(
  opts: GoogleClient & { code: string; codeVerifier: string; redirectUri: string },
  now: number,
  fetchFn: FetchFn = fetch,
): Promise<GoogleTokens> {
  const data = await postToken(
    {
      grant_type: 'authorization_code',
      code: opts.code,
      code_verifier: opts.codeVerifier,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    },
    fetchFn,
  )
  if (!data.refresh_token) throw new Error('Google did not return a refresh token.')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    scope: data.scope,
  }
}

/**
 * Returns tokens with a usable access token, refreshing if it is expired or about to be.
 * `refreshed` tells the caller to persist the new tokens.
 */
export async function ensureFreshGoogleTokens(
  tokens: GoogleTokens,
  client: GoogleClient,
  now: number,
  fetchFn: FetchFn = fetch,
): Promise<{ tokens: GoogleTokens; refreshed: boolean }> {
  if (tokens.expiresAt - EXPIRY_SKEW_MS > now) return { tokens, refreshed: false }
  const data = await postToken(
    {
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    },
    fetchFn,
  )
  return {
    tokens: {
      accessToken: data.access_token,
      // Google usually omits refresh_token on refresh; keep the existing one.
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: now + data.expires_in * 1000,
      scope: data.scope ?? tokens.scope,
    },
    refreshed: true,
  }
}

export async function fetchGoogleProfile(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<{ sub: string; email: string }> {
  return fetchJson(USERINFO_URL, { accessToken, fetchFn })
}

/**
 * Revokes the grant so the app disappears from the user's Google account access list.
 * Revoking the refresh token also invalidates its access tokens.
 */
export async function revokeGoogleToken(token: string, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await fetchFn(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })
  if (res.ok) return
  const text = await res.text()
  // invalid_token means it was already revoked or expired: the outcome the user wants.
  if (res.status === 400 && text.includes('invalid_token')) return
  throw new HttpError(res.status, text, REVOKE_URL)
}

/** Scopes the user may have unchecked on the consent screen. */
export function missingGoogleScopes(grantedScope: string): string[] {
  const granted = new Set(grantedScope.split(' '))
  return GOOGLE_SCOPES.filter((s) => s.startsWith('https://') && !granted.has(s))
}
