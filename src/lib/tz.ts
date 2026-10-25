// Timezone helpers for Asia/Shanghai (fixed UTC+8, no DST)
export const TZ = 'Asia/Shanghai'
const TZ_OFFSET_MIN = 8 * 60

/** Current date string 'YYYY-MM-DD' in Asia/Shanghai */
export function todayStr(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10)
}

/** Current 'HH:mm' in Asia/Shanghai */
export function nowTimeStr(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16)
}

/** UTC Date for the START of a Shanghai day given 'YYYY-MM-DD' */
export function dayStartUtc(dateStr: string, now: Date = new Date()): Date {
  return new Date(`${dateStr}T00:00:00+08:00`)
}

/** { start, end } UTC Date pair covering the whole Shanghai day */
export function shanghaiDayRange(dateStr: string): { start: Date; end: Date } {
  const start = dayStartUtc(dateStr)
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) }
}

/** Combine 'YYYY-MM-DD' + 'HH:mm' (Shanghai wall time) into a UTC Date */
export function combineToUtc(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  // dayStartUtc already lands on Shanghai midnight in UTC; add wall-clock minutes directly
  return new Date(dayStartUtc(dateStr).getTime() + (h * 60 + m) * 60000)
}

/** Weekday shorthand of 'YYYY-MM-DD' → 'MON'..'SUN' */
export function weekdayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()]
}

/** Add n days to 'YYYY-MM-DD' → 'YYYY-MM-DD' */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000
  )
}

/** Parse an ISO date into Shanghai y/m/d parts */
export function shanghaiParts(d: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const s = new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString()
  return {
    y: Number(s.slice(0, 4)),
    m: Number(s.slice(5, 7)),
    d: Number(s.slice(8, 10)),
    hh: Number(s.slice(11, 13)),
    mm: Number(s.slice(14, 16)),
  }
}

/** 'YYYY-MM-DD' of an instant in Shanghai */
export function dateStrOf(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10)
}

/** Friendly formatting, e.g. 'Jan 15, 09:00' (Shanghai wall time) */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = shanghaiParts(d)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const hh = String(p.hh).padStart(2, '0')
  const mm = String(p.mm).padStart(2, '0')
  return `${months[p.m - 1]} ${p.d}, ${hh}:${mm}`
}

/** Parse recurrence string → { kind, days } */
export function parseRecurrence(recurrence: string): { kind: 'SINGLE' | 'DAILY' | 'WEEKLY'; days: string[] } {
  if (recurrence === 'SINGLE' || recurrence === 'DAILY') return { kind: recurrence, days: [] }
  if (recurrence.startsWith('WEEKLY:')) {
    const days = recurrence.slice(7).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    const valid = days.filter((d) => ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(d))
    if (valid.length === 0) throw new Error('Invalid WEEKLY recurrence')
    return { kind: 'WEEKLY', days: valid }
  }
  throw new Error('Invalid recurrence')
}

/** Occurrence index (0-based) of `dateStr` for a recurring schedule that started at `startDate` */
export function occurrenceIndex(
  startDate: string,
  dateStr: string,
  kind: 'DAILY' | 'WEEKLY',
  days: string[]
): number {
  if (kind === 'DAILY') return diffDays(startDate, dateStr)
  // WEEKLY: count matching weekdays in [startDate, dateStr]
  const total = diffDays(startDate, dateStr) + 1
  const fullWeeks = Math.floor(total / 7)
  const rem = total % 7
  let count = fullWeeks * days.length
  for (let i = 0; i < rem; i++) {
    if (days.includes(weekdayOf(addDays(startDate, i)))) count++
  }
  return count - 1
}
