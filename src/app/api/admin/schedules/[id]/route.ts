import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseRecurrence, dayStartUtc, todayStr } from '@/lib/tz'
import { ensureTasksUpToDate } from '@/lib/task-generator'
import { parseJsonBody, parseRotationIds, resolveRotationMembers } from '@/lib/api-utils'
import { ensureQueueForDispenser, syncQueueOrder } from '@/lib/rotation-queue'
import { serializeSchedule } from '@/lib/serialize'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  recurrence: z.string().min(1).optional(),
  startDate: z.string().regex(DATE_RE, 'startDate must be a YYYY-MM-DD date').optional(),
  endDate: z.string().regex(DATE_RE, 'endDate must be a YYYY-MM-DD date').nullable().optional(),
  dueTime: z.string().regex(TIME_RE, 'dueTime must be HH:mm between 00:00 and 23:59').optional(),
  assignedToId: z.string().min(1).nullable().optional(),
  rotationMemberIds: z.array(z.string().min(1)).optional(),
})

/**
 * Delete a schedule's UNFINISHED tasks due from `from` onwards.
 * DONE/MISSED tasks always stay for history.
 */
async function deletePendingFrom(scheduleId: string, from: Date): Promise<number> {
  const res = await db.refillTask.deleteMany({
    where: { scheduleId, status: 'PENDING', dueAt: { gte: from } },
  })
  return res.count
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()
    const body = await parseJsonBody(req, patchSchema)

    const existing = await db.schedule.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Schedule not found')

    // --- Assignment: merge patch with current mode (fixed vs rotation) ---
    let assignedToId = existing.assignedToId
    let rotationIds = parseRotationIds(existing.rotationMembers)
    if (body.rotationMemberIds !== undefined && body.rotationMemberIds.length > 0) {
      // Switching to (or editing) rotation mode — a rotation schedule has no fixed assignee.
      rotationIds = [...new Set(body.rotationMemberIds)]
      assignedToId = null
    } else if (body.assignedToId !== undefined) {
      assignedToId = body.assignedToId
      if (assignedToId) rotationIds = [] // switching to fixed clears the rotation
    }
    if (assignedToId && rotationIds.length > 0) {
      throw new HttpError(400, 'Choose either a fixed assignee or rotation members, not both')
    }
    if (!assignedToId && rotationIds.length === 0) {
      throw new HttpError(400, 'Choose a fixed assignee or at least 2 rotation members')
    }
    if (assignedToId) {
      const assignee = await db.user.findUnique({ where: { id: assignedToId } })
      if (!assignee) throw new HttpError(400, 'Assigned user not found')
    } else if (rotationIds.length > 0) {
      if (rotationIds.length < 2) {
        throw new HttpError(400, 'Rotation requires at least 2 distinct members')
      }
      const found = await db.user.findMany({
        where: { id: { in: rotationIds } },
        select: { id: true },
      })
      if (found.length !== rotationIds.length) {
        throw new HttpError(400, 'One or more rotation members do not exist')
      }
    }

    // --- Recurrence / dates / time ---
    let recurrence = existing.recurrence
    if (body.recurrence !== undefined) {
      let parsed
      try {
        parsed = parseRecurrence(body.recurrence)
      } catch {
        throw new HttpError(400, 'Invalid recurrence (expected SINGLE, DAILY or WEEKLY:MON,TUE,...)')
      }
      recurrence = parsed.kind === 'WEEKLY' ? `WEEKLY:${parsed.days.join(',')}` : parsed.kind
    }
    const startDate = body.startDate !== undefined ? dayStartUtc(body.startDate) : existing.startDate
    let endDate = existing.endDate
    if (body.endDate !== undefined) endDate = body.endDate ? dayStartUtc(body.endDate) : null
    if (endDate && endDate < startDate) {
      throw new HttpError(400, 'endDate must be on or after startDate')
    }
    const dueTime = body.dueTime ?? existing.dueTime
    const isActive = body.isActive ?? existing.isActive

    const schedule = await db.schedule.update({
      where: { id },
      data: {
        recurrence,
        startDate,
        endDate,
        dueTime,
        assignedToId: assignedToId ?? null,
        rotationMembers: rotationIds.length > 0 ? JSON.stringify(rotationIds) : null,
        isActive,
      },
      include: { dispenser: true, assignedTo: true },
    })

    // Rules changed (or the schedule was paused) → drop this schedule's
    // unfinished tasks from the start of today and regenerate to match.
    const rulesChanged =
      body.recurrence !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined ||
      body.dueTime !== undefined ||
      body.assignedToId !== undefined ||
      body.rotationMemberIds !== undefined ||
      (body.isActive !== undefined && body.isActive !== existing.isActive)

    if (rulesChanged) {
      await deletePendingFrom(id, dayStartUtc(todayStr()))
      await ensureTasksUpToDate(true)
    }

    // Keep the dispenser's live rotation queue aligned with the picked order —
    // but ONLY when the admin actually edited the rotation members. Editing
    // just the time/dates must never reshuffle or shrink the live queue.
    if (body.rotationMemberIds !== undefined && rotationIds.length >= 2) {
      await ensureQueueForDispenser(schedule.dispenserId, rotationIds)
      await syncQueueOrder(schedule.dispenserId, rotationIds)
    }

    return Response.json({
      schedule: serializeSchedule(schedule, await resolveRotationMembers(rotationIds)),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()

    const existing = await db.schedule.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Schedule not found')

    // Remove the tasks this schedule generated that nobody completed —
    // deleting a schedule should NOT leave orphaned pending tasks behind.
    // DONE/MISSED tasks stay for history. Also clear the deleted rules'
    // tasks still due today+ (same query, no cutoff) before SetNull kicks in.
    await db.refillTask.deleteMany({ where: { scheduleId: id, status: 'PENDING' } })
    await db.schedule.delete({ where: { id } })

    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
