import type { NormalizedEvent } from '@prm/shared'
import { DAY_MS, startOfDay } from './format'

/**
 * Buckets events by local day, starting at `from` (a local midnight). Multi-day
 * events appear on every day they overlap within the range.
 */
export function groupByDay(
  events: NormalizedEvent[],
  from: number,
  days: number,
): Array<[number, NormalizedEvent[]]> {
  const rangeEnd = from + days * DAY_MS
  const buckets = new Map<number, NormalizedEvent[]>()
  for (const event of events) {
    let day = Math.max(startOfDay(event.start), from)
    // Zero-length events still belong to the day they start on.
    while (day < rangeEnd && (day < event.end || day === startOfDay(event.start))) {
      buckets.set(day, [...(buckets.get(day) ?? []), event])
      day = startOfDay(day + DAY_MS + 3_600_000) // +1h so a 23h DST day still lands on the next date
    }
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b)
}
