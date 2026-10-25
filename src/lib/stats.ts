import { todayStr, addDays, dateStrOf } from '@/lib/tz'

/**
 * Streak = number of consecutive days (ending today, or yesterday if today
 * has no completion yet) where the member completed at least one refill.
 * `doneDates` = set of 'YYYY-MM-DD' strings (Asia/Shanghai) of DONE tasks.
 */
export function streakOf(doneDates: Set<string>): number {
  let cursor = doneDates.has(todayStr()) ? todayStr() : addDays(todayStr(), -1)
  // If neither today nor yesterday has a completion, streak is 0
  if (!doneDates.has(cursor)) return 0
  let streak = 0
  while (doneDates.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Build the done-dates set from completedAt ISO strings */
export function doneDateSet(completedAts: (string | Date)[]): Set<string> {
  return new Set(completedAts.map((c) => dateStrOf(typeof c === 'string' ? new Date(c) : c)))
}
