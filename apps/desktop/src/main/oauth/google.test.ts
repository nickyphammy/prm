import { describe, expect, it, vi } from 'vitest'
import { AuthRevokedError } from '../errors'
import {
  buildGoogleAuthUrl,
  ensureFreshGoogleTokens,
  exchangeGoogleCode,
  missingGoogleScopes,
  revokeGoogleToken,
  type GoogleTokens,
} from './google'
import { createPkcePair } from './pkce'

const client = { clientId: 'cid', clientSecret: 'secret' }
const NOW = 1_800_000_000_000
const tokens: GoogleTokens = {
  accessToken: 'old',
  refreshToken: 'refresh',
  expiresAt: NOW + 30 * 60_000,
  scope: 's',
}

const tokenResponse = (body: unknown, status = 200) =>
  vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  )

describe('buildGoogleAuthUrl', () => {
  it('requests offline access with PKCE', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5000/oauth/google',
        codeChallenge: 'ch',
        state: 'st',
      }),
    )
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('scope')).toContain('gmail.readonly')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/oauth/google')
  })

  it('creates a verifier/challenge pair', () => {
    const { verifier, challenge } = createPkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(challenge).not.toBe(verifier)
  })
})

describe('ensureFreshGoogleTokens', () => {
  it('reuses a token that is still valid', async () => {
    const fetchFn = tokenResponse({})
    const result = await ensureFreshGoogleTokens(tokens, client, NOW, fetchFn as typeof fetch)
    expect(result).toEqual({ tokens, refreshed: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refreshes a token about to expire and keeps the refresh token', async () => {
    const fetchFn = tokenResponse({ access_token: 'new', expires_in: 3600, scope: 's' })
    const result = await ensureFreshGoogleTokens(
      { ...tokens, expiresAt: NOW + 10_000 },
      client,
      NOW,
      fetchFn as typeof fetch,
    )
    expect(result.refreshed).toBe(true)
    expect(result.tokens).toEqual({
      accessToken: 'new',
      refreshToken: 'refresh',
      expiresAt: NOW + 3_600_000,
      scope: 's',
    })
    const body = new URLSearchParams(String(fetchFn.mock.calls[0]![1]!.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh')
  })

  it('reports a revoked refresh token as AuthRevokedError', async () => {
    const fetchFn = tokenResponse({ error: 'invalid_grant' }, 400)
    await expect(
      ensureFreshGoogleTokens(
        { ...tokens, expiresAt: NOW - 1 },
        client,
        NOW,
        fetchFn as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(AuthRevokedError)
  })
})

describe('exchangeGoogleCode', () => {
  it('requires a refresh token', async () => {
    const fetchFn = tokenResponse({ access_token: 'a', expires_in: 3600, scope: 's' })
    await expect(
      exchangeGoogleCode(
        { ...client, code: 'c', codeVerifier: 'v', redirectUri: 'r' },
        NOW,
        fetchFn as typeof fetch,
      ),
    ).rejects.toThrow('refresh token')
  })
})

describe('revokeGoogleToken', () => {
  it('posts the token to the revoke endpoint', async () => {
    const fetchFn = tokenResponse({})
    await revokeGoogleToken('refresh', fetchFn as typeof fetch)
    expect(String(fetchFn.mock.calls[0]![0])).toBe('https://oauth2.googleapis.com/revoke')
    expect(new URLSearchParams(String(fetchFn.mock.calls[0]![1]!.body)).get('token')).toBe(
      'refresh',
    )
  })

  it('treats an already-invalid token as revoked, and surfaces other failures', async () => {
    await expect(
      revokeGoogleToken('t', tokenResponse({ error: 'invalid_token' }, 400) as typeof fetch),
    ).resolves.toBeUndefined()
    await expect(
      revokeGoogleToken('t', tokenResponse({ error: 'server' }, 503) as typeof fetch),
    ).rejects.toThrow('HTTP 503')
  })
})

describe('missingGoogleScopes', () => {
  it('flags API scopes the user unchecked', () => {
    expect(
      missingGoogleScopes('openid email https://www.googleapis.com/auth/calendar.readonly'),
    ).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
  })
})
