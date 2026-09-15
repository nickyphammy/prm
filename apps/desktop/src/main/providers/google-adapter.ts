import { env } from '../env'
import { startLoopback } from '../oauth/loopback'
import {
  buildGoogleAuthUrl,
  ensureFreshGoogleTokens,
  exchangeGoogleCode,
  fetchGoogleProfile,
  missingGoogleScopes,
  revokeGoogleToken,
  type GoogleTokens,
} from '../oauth/google'
import { createPkcePair, randomToken } from '../oauth/pkce'
import { fetchGoogleEvents } from './gcal'
import { fetchInbox } from './gmail'
import type { ProviderAdapter } from './types'

/** How far ahead the calendar cache reaches; agenda widgets can show up to this many days. */
export const CALENDAR_WINDOW_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export const googleAdapter: ProviderAdapter<GoogleTokens> = {
  id: 'google',

  async connect({ openBrowser, signal }) {
    const client = { clientId: env.googleClientId(), clientSecret: env.googleClientSecret() }
    const loopback = await startLoopback('/oauth/google', signal)
    try {
      const pkce = createPkcePair()
      const state = randomToken()
      await openBrowser(
        buildGoogleAuthUrl({
          clientId: client.clientId,
          redirectUri: loopback.redirectUri,
          codeChallenge: pkce.challenge,
          state,
        }),
      )
      const params = await loopback.waitForCallback()
      if (params.get('error')) throw new Error(`Google sign-in failed: ${params.get('error')}`)
      if (params.get('state') !== state)
        throw new Error('Sign-in response did not match the request.')

      const tokens = await exchangeGoogleCode(
        {
          ...client,
          code: params.get('code') ?? '',
          codeVerifier: pkce.verifier,
          redirectUri: loopback.redirectUri,
        },
        Date.now(),
      )
      const missing = missingGoogleScopes(tokens.scope)
      if (missing.length > 0) {
        throw new Error(
          'Please allow access to both Google Calendar and Gmail on the consent screen.',
        )
      }
      const profile = await fetchGoogleProfile(tokens.accessToken)
      return { externalId: profile.sub, label: profile.email, tokens }
    } finally {
      loopback.close()
    }
  },

  revoke: (tokens) => revokeGoogleToken(tokens.refreshToken),

  async sync({ account, store, now }) {
    const client = { clientId: env.googleClientId(), clientSecret: env.googleClientSecret() }
    const fresh = await ensureFreshGoogleTokens(account.tokens, client, now)
    if (fresh.refreshed) store.saveTokens(account.id, fresh.tokens)
    const { accessToken } = fresh.tokens

    const startOfToday = new Date(now).setHours(0, 0, 0, 0)
    // Calendar and Gmail sync independently so one failing doesn't blank the other widget.
    const [events, emails] = await Promise.allSettled([
      fetchGoogleEvents(accessToken, account.id, {
        from: startOfToday,
        to: startOfToday + CALENDAR_WINDOW_DAYS * DAY_MS,
      }),
      fetchInbox(accessToken, account.id, account.label),
    ])
    if (events.status === 'fulfilled') store.replaceItems(account.id, 'event', '', events.value)
    if (emails.status === 'fulfilled') store.replaceItems(account.id, 'email', '', emails.value)

    const failure = [events, emails].find((r) => r.status === 'rejected')
    if (failure) throw failure.reason
  },
}
