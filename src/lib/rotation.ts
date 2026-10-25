// Completion-driven sequential rotation ("who's next?") for refill schedules.
//
// Model: a schedule's `rotationMembers` JSON is an ordered list of user ids.
// The sequence is anchored at the LAST COMPLETION, not at the calendar date:
// after person X completes a refill, the next occurrence(s) of that schedule
// go to the person AFTER X in the ordered list, wrapping around.
//
// Notes:
// - Rotation is defined per schedule. For ad-hoc requests on a dispenser we
//   reuse the newest active rotation schedule of that dispenser.
// - Missed tasks do NOT advance the cursor; only completions do.
import { db } from '@/lib/db'
import { parseRotationIds } from '@/lib/api-utils'
import type { Schedule } from '@prisma/client'

export interface PersonRef {
  id: string
  name: string
}

/** Id of the person after `completerId` in the ordered rotation (wraps around). */
export function successorOf(rotationIds: string[], completerId: string | null): string | null {
  if (rotationIds.length === 0) return null
  if (!completerId) return rotationIds[0]
  const idx = rotationIds.indexOf(completerId)
  if (idx === -1) return rotationIds[0]
  return rotationIds[(idx + 1) % rotationIds.length]
}

/**
 * Re-sequence a schedule's future PENDING tasks after a completion so the
 * next one lands on the completer's successor. Returns how many tasks moved.
 */
export async function rebalanceScheduleAfterCompletion(task: {
  scheduleId: string | null
  dueAt: Date
  assignedToId: string | null
}): Promise<number> {
  if (!task.scheduleId || !task.assignedToId) return 0

  const schedule = await db.schedule.findUnique({ where: { id: task.scheduleId } })
  if (!schedule || !schedule.isActive) return 0

  const rotation = parseRotationIds(schedule.rotationMembers)
  if (rotation.length < 2) return 0

  const completerIdx = rotation.indexOf(task.assignedToId)
  if (completerIdx === -1) return 0 // completer left the rotation — keep assignments

  const pending = await db.refillTask.findMany({
    where: { scheduleId: task.scheduleId, status: 'PENDING', dueAt: { gt: task.dueAt } },
    orderBy: { dueAt: 'asc' },
    select: { id: true, assignedToId: true },
  })

  let changed = 0
  for (let i = 0; i < pending.length; i++) {
    const nextId = rotation[(completerIdx + 1 + i) % rotation.length]
    if (pending[i].assignedToId !== nextId) {
      await db.refillTask.update({
        where: { id: pending[i].id },
        data: { assignedToId: nextId },
      })
      changed++
    }
  }
  return changed
}

/**
 * Who should take the NEXT occurrence of a schedule? Successor of the most
 * recent completer (whose membership is still valid), else the first in line.
 */
export async function nextAssigneeForSchedule(
  schedule: Pick<Schedule, 'id' | 'rotationMembers'>
): Promise<string | null> {
  const rotation = parseRotationIds(schedule.rotationMembers)
  if (rotation.length === 0) return null

  const recentDone = await db.refillTask.findMany({
    where: { scheduleId: schedule.id, status: 'DONE' },
    orderBy: { completedAt: 'desc' },
    take: 8,
    select: { assignedToId: true },
  })
  const completer = recentDone.find((t) => t.assignedToId && rotation.includes(t.assignedToId))
  return successorOf(rotation, completer?.assignedToId ?? null)
}

/**
 * Rotation source for an ad-hoc "dispenser is empty" request: the newest
 * active rotation schedule of that dispenser, falling back to every active
 * user when no rotation schedule exists.
 */
export async function rotationSourceForDispenser(dispenserId: string): Promise<string[]> {
  const schedule = await db.schedule.findFirst({
    where: { dispenserId, isActive: true, rotationMembers: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { rotationMembers: true },
  })
  if (schedule) {
    const ids = parseRotationIds(schedule.rotationMembers)
    if (ids.length > 0) return ids
  }
  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

/** Next person in line for a dispenser (ad-hoc refill requests). */
export async function nextAssigneeForDispenser(dispenserId: string): Promise<string | null> {
  const rotation = await rotationSourceForDispenser(dispenserId)
  if (rotation.length === 0) return null

  const recentDone = await db.refillTask.findMany({
    where: { dispenserId, status: 'DONE' },
    orderBy: { completedAt: 'desc' },
    take: 8,
    select: { assignedToId: true },
  })
  const completer = recentDone.find((t) => t.assignedToId && rotation.includes(t.assignedToId))
  return successorOf(rotation, completer?.assignedToId ?? null)
}

/**
 * Batched "next up" per schedule for admin lists.
 * Returns scheduleId -> { id, name } (null for fixed-assignee schedules).
 */
export async function nextUpForSchedules(
  schedules: Schedule[]
): Promise<Map<string, PersonRef | null>> {
  const result = new Map<string, PersonRef | null>()
  const withRotation = schedules.filter((s) => parseRotationIds(s.rotationMembers).length > 0)
  if (withRotation.length === 0) return result

  const doneTasks = await db.refillTask.findMany({
    where: { scheduleId: { in: withRotation.map((s) => s.id) }, status: 'DONE' },
    orderBy: { completedAt: 'desc' },
    take: 1000,
    select: { scheduleId: true, assignedToId: true },
  })

  const nextIdBySchedule = new Map<string, string | null>()
  const nextIds = new Set<string>()
  for (const s of withRotation) {
    const rotation = parseRotationIds(s.rotationMembers)
    const completer = doneTasks.find(
      (t) => t.scheduleId === s.id && t.assignedToId && rotation.includes(t.assignedToId)
    )
    const nextId = successorOf(rotation, completer?.assignedToId ?? null)
    nextIdBySchedule.set(s.id, nextId)
    if (nextId) nextIds.add(nextId)
  }

  const users = await db.user.findMany({
    where: { id: { in: [...nextIds] } },
    select: { id: true, name: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name] as const))

  for (const [scheduleId, nextId] of nextIdBySchedule) {
    const name = nextId ? nameById.get(nextId) : undefined
    result.set(scheduleId, nextId && name ? { id: nextId, name } : null)
  }
  return result
}
