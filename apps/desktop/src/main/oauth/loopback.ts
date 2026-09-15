import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ConnectCancelledError } from '../errors'

const TIMEOUT_MS = 5 * 60 * 1000

const page = (title: string, body: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f7f5;color:#1f1f1f}
main{text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#666;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`

export interface LoopbackServer {
  port: number
  redirectUri: string
  /** Resolves with the callback's query params once the browser hits `callbackPath`. */
  waitForCallback(): Promise<URLSearchParams>
  close(): void
}

/**
 * Starts a one-shot HTTP listener on 127.0.0.1 with an OS-assigned port, the
 * standard redirect target for OAuth in native apps (RFC 8252 §7.3).
 */
export async function startLoopback(
  callbackPath: string,
  signal?: AbortSignal,
): Promise<LoopbackServer> {
  let resolveCallback!: (params: URLSearchParams) => void
  let rejectCallback!: (err: Error) => void
  const callback = new Promise<URLSearchParams>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })
  signal?.addEventListener('abort', () => rejectCallback(new ConnectCancelledError()), {
    once: true,
  })

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== callbackPath) {
      res.writeHead(404).end()
      return
    }
    const failed = url.searchParams.has('error')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      failed
        ? page('Connection cancelled', 'You can close this tab and try again from PRM Dashboard.')
        : page('Connected', 'You can close this tab and return to PRM Dashboard.'),
    )
    resolveCallback(url.searchParams)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo

  const timer = setTimeout(
    () => rejectCallback(new Error('Timed out waiting for sign-in.')),
    TIMEOUT_MS,
  )
  const close = (): void => {
    clearTimeout(timer)
    server.close()
    server.closeAllConnections()
  }

  return {
    port,
    redirectUri: `http://127.0.0.1:${port}${callbackPath}`,
    waitForCallback: () => callback,
    close,
  }
}
