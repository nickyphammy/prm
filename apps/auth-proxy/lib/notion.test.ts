import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../api/notion/callback'
import { POST } from '../api/notion/token'
import { exchangeWithNotion, parseLoopbackPort, readConfig } from './notion'

const NONCE = 'abcdefghijklmnopqrstuvwxyz012345'

describe('parseLoopbackPort', () => {
  it('accepts port.nonce with an unprivileged port', () => {
    expect(parseLoopbackPort(`51234.${NONCE}`)).toBe(51234)
  })

  it.each([
    '',
    NONCE,
    `80.${NONCE}`,
    `99999.${NONCE}`,
    '51234.short',
    `51234.${NONCE}/../evil`,
    `evil.com.${NONCE}`,
  ])('rejects %j', (state) => expect(parseLoopbackPort(state)).toBeNull())
})

describe('readConfig', () => {
  it('trims whitespace picked up when pasting into a dashboard', () => {
    expect(
      readConfig({ NOTION_CLIENT_ID: ' id\n', NOTION_CLIENT_SECRET: 'secret ', NOTION_REDIRECT_URI: ' ' }),
    ).toEqual({ clientId: 'id', clientSecret: 'secret', redirectUri: undefined })
  })
})

describe('GET /api/notion/callback', () => {
  it('redirects only to the loopback port in state', () => {
    const res = GET(
      new Request(
        `https://proxy.test/api/notion/callback?code=c0de&state=51234.${NONCE}&extra=ignored`,
      ),
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('Location')!)
    expect(location.origin).toBe('http://127.0.0.1:51234')
    expect(location.pathname).toBe('/notion/callback')
    expect(location.searchParams.get('code')).toBe('c0de')
    expect(location.searchParams.get('state')).toBe(`51234.${NONCE}`)
    expect(location.searchParams.has('extra')).toBe(false)
  })

  it('forwards a user denial', () => {
    const res = GET(
      new Request(
        `https://proxy.test/api/notion/callback?error=access_denied&state=51234.${NONCE}`,
      ),
    )
    expect(new URL(res.headers.get('Location')!).searchParams.get('error')).toBe('access_denied')
  })

  it('rejects a bad state', () => {
    expect(
      GET(new Request('https://proxy.test/api/notion/callback?code=c&state=nope')).status,
    ).toBe(400)
  })
})

describe('exchangeWithNotion', () => {
  const config = {
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://proxy.test/api/notion/callback',
  }

  it('sends basic auth + redirect_uri and forwards only the needed fields', async () => {
    const fetchFn = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: 'ntn_x',
            refresh_token: 'r',
            workspace_id: 'w',
            workspace_name: 'Acme',
            workspace_icon: null,
            bot_id: 'b',
            owner: { type: 'user', user: { person: { email: 'private@example.com' } } },
          }),
        ),
    )
    const result = await exchangeWithNotion(
      { grant_type: 'authorization_code', code: 'c' },
      config,
      fetchFn as typeof fetch,
    )
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      access_token: 'ntn_x',
      refresh_token: 'r',
      workspace_id: 'w',
      workspace_name: 'Acme',
      workspace_icon: null,
      bot_id: 'b',
    })

    const init = fetchFn.mock.calls[0]![1]!
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('id:secret').toString('base64')}`,
    )
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: 'authorization_code',
      code: 'c',
      redirect_uri: config.redirectUri,
    })
  })

  it('passes through the error code only', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', message: 'details' }), {
          status: 400,
        }),
    )
    const result = await exchangeWithNotion(
      { grant_type: 'refresh_token', refresh_token: 'r' },
      config,
      fetchFn as typeof fetch,
    )
    expect(result).toEqual({ status: 400, body: { error: 'invalid_grant' } })
  })
})

describe('POST /api/notion/token', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const post = (body: unknown) =>
    POST(
      new Request('https://proxy.test/api/notion/token', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    )

  it('fails closed when the secret is not configured', async () => {
    vi.stubEnv('NOTION_CLIENT_ID', '')
    vi.stubEnv('NOTION_CLIENT_SECRET', '')
    expect((await post({ code: 'c' })).status).toBe(500)
  })

  it('validates input', async () => {
    vi.stubEnv('NOTION_CLIENT_ID', 'id')
    vi.stubEnv('NOTION_CLIENT_SECRET', 'secret')
    expect((await post('not json')).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ code: 42 })).status).toBe(400)
  })

  it('derives the redirect URI from the deployment origin', async () => {
    vi.stubEnv('NOTION_CLIENT_ID', 'id')
    vi.stubEnv('NOTION_CLIENT_SECRET', 'secret')
    vi.stubEnv('NOTION_REDIRECT_URI', '')
    const fetchMock = vi.fn(
      async (_u: string | URL | Request, _i?: RequestInit) =>
        new Response(JSON.stringify({ access_token: 't', workspace_id: 'w' })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await post({ code: 'c' })
    expect(res.status).toBe(200)
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).redirect_uri).toBe(
      'https://proxy.test/api/notion/callback',
    )
  })
})
