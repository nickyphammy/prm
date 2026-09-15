import { describe, expect, it } from 'vitest'
import { ConnectCancelledError } from '../errors'
import { startLoopback } from './loopback'
import { encodeNotionState } from './notion'

describe('startLoopback', () => {
  it('resolves with the callback query params', async () => {
    const server = await startLoopback('/oauth/test')
    try {
      expect(server.redirectUri).toBe(`http://127.0.0.1:${server.port}/oauth/test`)
      const res = await fetch(`${server.redirectUri}?code=abc&state=xyz`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Connected')
      const params = await server.waitForCallback()
      expect(params.get('code')).toBe('abc')
      expect(params.get('state')).toBe('xyz')
    } finally {
      server.close()
    }
  })

  it('ignores other paths', async () => {
    const server = await startLoopback('/oauth/test')
    try {
      expect((await fetch(`http://127.0.0.1:${server.port}/favicon.ico`)).status).toBe(404)
    } finally {
      server.close()
    }
  })

  it('rejects when the connection is cancelled', async () => {
    const controller = new AbortController()
    const server = await startLoopback('/oauth/test', controller.signal)
    controller.abort()
    await expect(server.waitForCallback()).rejects.toBeInstanceOf(ConnectCancelledError)
    server.close()
  })

  it('encodes Notion state as port.nonce', () => {
    expect(encodeNotionState(51234, 'nonce')).toBe('51234.nonce')
  })
})
