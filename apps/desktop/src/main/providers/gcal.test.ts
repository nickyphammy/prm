import { describe, expect, it, vi } from 'vitest'
import { AuthRevokedError } from '../errors'
import { fetchGoogleEvents, mapGoogleEvent, type GoogleCalendar } from './gcal'

const calendar: GoogleCalendar = {
  id: 'primary@example.com',
  summary: 'Work',
  backgroundColor: '#7986cb',
  selected: true,
}

describe('mapGoogleEvent', () => {
  it('maps a timed event', () => {
    const event = mapGoogleEvent(
      {
        id: 'e1',
        summary: 'Standup',
        location: 'Room 4',
        htmlLink: 'https://calendar.google.com/event?eid=e1',
        start: { dateTime: '2026-09-15T09:00:00-07:00' },
        end: { dateTime: '2026-09-15T09:15:00-07:00' },
      },
      calendar,
      'acc',
    )
    expect(event).toEqual({
      kind: 'event',
      id: 'primary@example.com:e1',
      accountId: 'acc',
      calendarName: 'Work',
      title: 'Standup',
      start: Date.parse('2026-09-15T16:00:00Z'),
      end: Date.parse('2026-09-15T16:15:00Z'),
      allDay: false,
      location: 'Room 4',
      url: 'https://calendar.google.com/event?eid=e1',
      color: '#7986cb',
    })
  })

  it('pins all-day events to local midnight', () => {
    const event = mapGoogleEvent(
      { id: 'e2', summary: 'Holiday', start: { date: '2026-09-15' }, end: { date: '2026-09-16' } },
      calendar,
      'acc',
    )
    expect(event?.allDay).toBe(true)
    expect(event?.start).toBe(new Date(2026, 8, 15).getTime())
    expect(event?.end).toBe(new Date(2026, 8, 16).getTime())
  })

  it('hides cancelled and declined events, and titles untitled ones', () => {
    const base = { start: { date: '2026-09-15' }, end: { date: '2026-09-16' } }
    expect(mapGoogleEvent({ id: 'c', status: 'cancelled', ...base }, calendar, 'acc')).toBeNull()
    expect(
      mapGoogleEvent(
        { id: 'd', attendees: [{ self: true, responseStatus: 'declined' }], ...base },
        calendar,
        'acc',
      ),
    ).toBeNull()
    expect(mapGoogleEvent({ id: 'u', summary: '  ', ...base }, calendar, 'acc')?.title).toBe(
      '(No title)',
    )
  })
})

describe('fetchGoogleEvents', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  it('only queries calendars the user has selected, and sorts across them', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/calendarList')) {
        return json({
          items: [
            { id: 'a', summary: 'A', selected: true },
            { id: 'b', summary: 'B', selected: false },
            { id: 'c', summary: 'C', selected: true },
          ],
        })
      }
      if (url.includes('/calendars/a/')) {
        return json({
          items: [
            {
              id: '2',
              start: { dateTime: '2026-09-15T12:00:00Z' },
              end: { dateTime: '2026-09-15T13:00:00Z' },
            },
          ],
        })
      }
      return json({
        items: [
          {
            id: '1',
            start: { dateTime: '2026-09-15T08:00:00Z' },
            end: { dateTime: '2026-09-15T09:00:00Z' },
          },
        ],
      })
    })

    const events = await fetchGoogleEvents(
      'token',
      'acc',
      { from: 0, to: 1 },
      fetchFn as typeof fetch,
    )
    expect(events.map((e) => e.id)).toEqual(['c:1', 'a:2'])
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/calendars/b/'))).toBe(false)
  })

  it('turns a 401 into AuthRevokedError', async () => {
    const fetchFn = vi.fn(async () => json({ error: 'unauthorized' }, 401))
    await expect(
      fetchGoogleEvents('bad', 'acc', { from: 0, to: 1 }, fetchFn as typeof fetch),
    ).rejects.toBeInstanceOf(AuthRevokedError)
  })
})
