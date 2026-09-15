const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  return new Date(ts).setHours(0, 0, 0, 0)
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export const formatTime = (ts: number): string => timeFmt.format(ts)

export function formatDayHeading(dayStart: number, now = Date.now()): string {
  const today = startOfDay(now)
  if (dayStart === today) return 'Today'
  if (dayStart === today + DAY_MS) return 'Tomorrow'
  return weekdayFmt.format(dayStart)
}

/** Compact timestamp for lists: "9:41 AM" today, "Sep 12" otherwise. */
export function formatRelativeShort(ts: number, now = Date.now()): string {
  return startOfDay(ts) === startOfDay(now) ? timeFmt.format(ts) : shortDateFmt.format(ts)
}

export function formatAgo(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'never'
  const minutes = Math.round((now - ts) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return shortDateFmt.format(ts)
}

export { DAY_MS }
