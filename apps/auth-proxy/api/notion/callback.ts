import { parseLoopbackPort } from '../../lib/notion.js'

/**
 * Notion redirects here after the user approves access. We can't redirect
 * Notion straight to the desktop app (redirect URIs must be fixed and https),
 * so we bounce the browser to the app's loopback listener, whose port is
 * encoded in `state`. Only 127.0.0.1 is ever a target, so this is not an open redirect.
 */
export function GET(request: Request): Response {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const port = parseLoopbackPort(state)
  if (port === null) {
    return new Response(
      'Invalid or missing state. Start the connection again from PRM Dashboard.',
      {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      },
    )
  }

  const target = new URL(`http://127.0.0.1:${port}/notion/callback`)
  target.searchParams.set('state', state)
  for (const key of ['code', 'error']) {
    const value = url.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
