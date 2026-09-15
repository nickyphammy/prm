import { describe, expect, it } from 'vitest'
import type { NormalizedEvent } from '@prm/shared'
import { groupByDay } from './agenda'

const day = (d: number, h = 0) => new Date(2026, 8, d, h).getTime()
const ev = (id: string, start: number, end: number, allDay = false): NormalizedEvent => ({
  kind: 'event',
  id,
  accountId: 'a',
  calendarName: 'c',
  title: id,
  start,
  end,
  allDay,
  location: null,
  url: null,
  color: null,
})

const ids = (groups: ReturnType<typeof groupByDay>) =>
  groups.map(([d, events]) => [new Date(d).getDate(), events.map((e) => e.id)])

describe('groupByDay', () => {
  it('buckets events by local day within the range', () => {
    const groups = groupByDay(
      [
        ev('a', day(15, 9), day(15, 10)),
        ev('b', day(17, 9), day(17, 10)),
        ev('late', day(30, 9), day(30, 10)),
      ],
      day(15),
      7,
    )
    expect(ids(groups)).toEqual([
      [15, ['a']],
      [17, ['b']],
    ])
  })

  it('shows multi-day and overnight events on each day they cover, but not the day an all-day event ends', () => {
    const groups = groupByDay(
      [
        ev('trip', day(14), day(17), true),
        ev('overnight', day(15, 23), day(16, 1)),
        ev('ends-at-midnight', day(15, 22), day(16)),
      ],
      day(15),
      7,
    )
    expect(ids(groups)).toEqual([
      [15, ['trip', 'overnight', 'ends-at-midnight']],
      [16, ['trip', 'overnight']],
    ])
  })

  it('keeps zero-length events', () => {
    expect(ids(groupByDay([ev('reminder', day(15, 9), day(15, 9))], day(15), 1))).toEqual([
      [15, ['reminder']],
    ])
  })
})
