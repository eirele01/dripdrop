import { db } from '@/lib/db'
import {
  todayStr,
  addDays,
  combineToUtc,
  dayStartUtc,
  weekdayOf,
  occurrenceIndex,
  parseRecurrence,
  dateStrOf,
} from '@/lib/tz'

// Lazy, idempotent task generation with in-memory lock + TTL.
// Replaces the "daily cron" from the spec: every tasks/dashboard API call
// tops up the next 7 days and flips yesterday's unfinished tasks to MISSED.

const HORIZON_DAYS = 7
let running: Promise<void> | null = null
let lastRun = 0

export async function ensureTasksUpToDate(force = false): Promise<void> {
  if (!force && Date.now() - lastRun < 60_000) return
  if (running) return running
  running = generate().finally(() => {
    running = null
    lastRun = Date.now()
  })
  return running
}

async function generate(): Promise<void> {
  const today = todayStr()
  const horizonEnd = addDays(today, HORIZON_DAYS - 1)

  // 1. Flip stale pending tasks (due before today, Shanghai) to MISSED
  await db.refillTask.updateMany({
    where: { status: 'PENDING', dueAt: { lt: dayStartUtc(today) } },
    data: { status: 'MISSED' },
  })

  // 2. Load active schedules that can produce occurrences in the window
  const schedules = await db.schedule.findMany({
    where: {
      isActive: true,
      startDate: { lte: new Date(`${horizonEnd}T23:59:59+08:00`) },
    },
    include: { dispenser: true },
  })

  const windowTasks = await db.refillTask.findMany({
    where: {
      scheduleId: { not: null },
      dueAt: { gte: dayStartUtc(today), lt: new Date(dayStartUtc(horizonEnd).getTime() + 86400000) },
    },
    select: { scheduleId: true, dueAt: true },
  })
  const existing = new Set(windowTasks.map((t) => `${t.scheduleId}|${t.dueAt.toISOString()}`))

  const creates: {
    scheduleId: string
    dispenserId: string
    assignedToId: string | null
    dueAt: Date
  }[] = []

  for (const s of schedules) {
    const startStr = dateStrOf(s.startDate)
    const endStr = s.endDate ? dateStrOf(s.endDate) : null
    const from = startStr > today ? startStr : today
    const to = endStr && endStr < horizonEnd ? endStr : horizonEnd
    if (from > to) continue

    let parsed
    try {
      parsed = parseRecurrence(s.recurrence)
    } catch {
      continue
    }

    let rotation: string[] = []
    try {
      rotation = s.rotationMembers ? (JSON.parse(s.rotationMembers) as string[]) : []
    } catch {
      rotation = []
    }

    // Completion-driven rotation: anchor the cursor at the LAST COMPLETION so
    // new occurrences continue the sequence after whoever refilled last.
    // Falls back to the occurrence index while a schedule has no completions.
    let cursor: number | null = null
    if (rotation.length > 0 && !s.assignedToId) {
      const recentDone = await db.refillTask.findMany({
        where: { scheduleId: s.id, status: 'DONE' },
        orderBy: { completedAt: 'desc' },
        take: 8,
        select: { assignedToId: true, dueAt: true },
      })
      const anchor = recentDone.find(
        (t) => t.assignedToId && rotation.includes(t.assignedToId)
      )
      if (anchor?.assignedToId) {
        const pendingAfter = await db.refillTask.count({
          where: { scheduleId: s.id, status: 'PENDING', dueAt: { gt: anchor.dueAt } },
        })
        cursor = rotation.indexOf(anchor.assignedToId) + 1 + pendingAfter
      }
    }

    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (parsed.kind === 'SINGLE' && d !== startStr) continue
      if (parsed.kind === 'WEEKLY' && !parsed.days.includes(weekdayOf(d))) continue

      const dueAt = combineToUtc(d, s.dueTime)
      const key = `${s.id}|${dueAt.toISOString()}`
      if (existing.has(key)) continue

      let assignedToId: string | null = s.assignedToId
      if (!assignedToId && rotation.length > 0) {
        if (cursor !== null) {
          assignedToId =
            rotation[((cursor % rotation.length) + rotation.length) % rotation.length]
          cursor++
        } else {
          const idx = occurrenceIndex(
            startStr,
            d,
            parsed.kind === 'WEEKLY' ? 'WEEKLY' : 'DAILY',
            parsed.days
          )
          assignedToId = rotation[((idx % rotation.length) + rotation.length) % rotation.length]
        }
      }

      creates.push({
        scheduleId: s.id,
        dispenserId: s.dispenserId,
        assignedToId,
        dueAt,
      })
    }
  }

  if (creates.length > 0) {
    // NOTE (Task 2-a): removed `skipDuplicates: true` — unsupported on SQLite (runtime error).
    // Dedup is already guaranteed by the `existing` set above plus the
    // @@unique([scheduleId, dueAt]) constraint; creates within one run are unique.
    await db.refillTask.createMany({ data: creates })
  }
}
