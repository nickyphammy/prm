import { join, relative, isAbsolute, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'

export const APP_SCHEME = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://renderer`

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

/**
 * Resolves an app:// URL to a file inside `root`, or null if it would escape it.
 * Exported for tests.
 */
export function resolveAppPath(root: string, url: string): string | null {
  const { host, pathname } = new URL(url)
  if (host !== 'renderer') return null
  const decoded = decodeURIComponent(pathname)
  const target = normalize(join(root, decoded === '/' ? 'index.html' : decoded))
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}

/**
 * Serves the built renderer from app://renderer/. Replaces file://, which the
 * grantFileProtocolExtraPrivileges fuse strips of the privileges module scripts need.
 */
export function handleAppScheme(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppPath(rendererRoot, request.url)
    if (!file) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
