import { AuthRevokedError, HttpError } from './errors'

export type FetchFn = typeof fetch

/** GET/POST JSON with a bearer token. 401s become AuthRevokedError so sync can flag the account. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { accessToken?: string; fetchFn?: FetchFn } = {},
): Promise<T> {
  const { accessToken, fetchFn = fetch, headers, ...rest } = init
  const res = await fetchFn(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })
  if (res.status === 401) throw new AuthRevokedError()
  if (!res.ok) throw new HttpError(res.status, await res.text(), url)
  return (await res.json()) as T
}

/** Run async work over items with bounded concurrency, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}
