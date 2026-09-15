import type { NormalizedEvent } from '@prm/shared'
import { fetchJson, mapWithConcurrency, type FetchFn } from '../http'

const API = 'https://www.googleapis.com/calendar/v3'

export interface GoogleCalendar {
  id: string
  summary: string
  summaryOverride?: string
  backgroundColor?: string
  selected?: boolean
  hidden?: boolean
}

export interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  attendees?: Array<{ self?: boolean; responseStatus?: string }>
}

/** "2026-09-15" → local midnight. All-day events have no timezone, so they follow the user's clock. */
function parseDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

function parseTime(t: { date?: string; dateTime?: string }): number {
  if (t.dateTime) return Date.parse(t.dateTime)
  if (t.date) return parseDate(t.date)
  throw new Error('Event time has neither date nor dateTime')
}

/** Returns null for events the dashboard should hide (cancelled, or declined by the user). */
export function mapGoogleEvent(
  raw: GoogleEvent,
  calendar: GoogleCalendar,
  accountId: string,
): NormalizedEvent | null {
  if (raw.status === 'cancelled') return null
  if (raw.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null
  return {
    kind: 'event',
    id: `${calendar.id}:${raw.id}`,
    accountId,
    calendarName: calendar.summaryOverride ?? calendar.summary,
    title: raw.summary?.trim() || '(No title)',
    start: parseTime(raw.start),
    end: parseTime(raw.end),
    allDay: !raw.start.dateTime,
    location: raw.location ?? null,
    url: raw.htmlLink ?? null,
    color: calendar.backgroundColor ?? null,
  }
}

/** Fetches events from every calendar the user has checked in Google Calendar. */
export async function fetchGoogleEvents(
  accessToken: string,
  accountId: string,
  range: { from: number; to: number },
  fetchFn: FetchFn = fetch,
): Promise<NormalizedEvent[]> {
  const list = await fetchJson<{ items: GoogleCalendar[] }>(
    `${API}/users/me/calendarList?minAccessRole=reader`,
    { accessToken, fetchFn },
  )
  const calendars = list.items.filter((c) => c.selected && !c.hidden)

  const perCalendar = await mapWithConcurrency(calendars, 4, async (calendar) => {
    const params = new URLSearchParams({
      timeMin: new Date(range.from).toISOString(),
      timeMax: new Date(range.to).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
    const data = await fetchJson<{ items: GoogleEvent[] }>(
      `${API}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
      { accessToken, fetchFn },
    )
    return data.items
      .map((e) => mapGoogleEvent(e, calendar, accountId))
      .filter((e): e is NormalizedEvent => e !== null)
  })

  return perCalendar.flat().sort((a, b) => a.start - b.start)
}
