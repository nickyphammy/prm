/** The provider rejected our credentials; the user must reconnect the account. */
export class AuthRevokedError extends Error {
  constructor(message = 'Access was revoked or expired. Reconnect this account.') {
    super(message)
    this.name = 'AuthRevokedError'
  }
}

export class ConnectCancelledError extends Error {
  constructor() {
    super('Connection cancelled.')
    this.name = 'ConnectCancelledError'
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}: ${body.slice(0, 200)}`)
    this.name = 'HttpError'
  }
}

export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  // Node's fetch throws a bare "fetch failed"; the useful detail (ECONNRESET, ETIMEDOUT, DNS…) is in `cause`.
  const cause = err.cause
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code
    return `${err.message} (${code ? `${code}: ` : ''}${cause.message})`
  }
  return err.message
}
