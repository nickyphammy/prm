import { describe, expect, it, vi } from 'vitest'

// app-protocol imports electron at module load; only the pure resolver is under test.
vi.mock('electron', () => ({ net: {}, protocol: {} }))

const { resolveAppPath } = await import('./app-protocol')

describe('resolveAppPath', () => {
  const root = '/app/out/renderer'

  it('maps app://renderer paths into the renderer folder', () => {
    expect(resolveAppPath(root, 'app://renderer/index.html')).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(root, 'app://renderer/')).toBe('/app/out/renderer/index.html')
    expect(resolveAppPath(root, 'app://renderer/assets/index-abc.js')).toBe(
      '/app/out/renderer/assets/index-abc.js',
    )
  })

  it('refuses to escape the renderer folder or serve other hosts', () => {
    // The URL parser collapses encoded dot segments, so this stays inside the root.
    expect(resolveAppPath(root, 'app://renderer/%2e%2e/main/index.js')).toBe(
      '/app/out/renderer/main/index.js',
    )
    // Encoded slashes survive URL parsing and only become ".." after decoding.
    expect(resolveAppPath(root, 'app://renderer/..%2F..%2Fsecrets')).toBeNull()
    expect(resolveAppPath(root, 'app://renderer/%2E%2E%2F%2E%2E%2Fmain%2Findex.js')).toBeNull()
    expect(resolveAppPath(root, 'app://other/index.html')).toBeNull()
  })
})
