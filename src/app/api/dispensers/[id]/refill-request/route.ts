// POST /api/dispensers/:id/refill-request
// "This dispenser just ran empty" — any signed-in user can flag it. The one-off
// task is auto-assigned via the dispenser's live rotation queue when one
// exists (the person-chain — no date math); otherwise it falls back to the
// schedule-based completion-driven rotation. No queue is created here:
// rotation stays opt-in per dispenser.
import { db } from '@/lib/db'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import { dayStartUtc, todayStr, shanghaiParts, formatDateTime } from '@/lib/tz'
import { ensureTasksUpToDate } from '@/lib/task-generator'
import {
  loadQueueByDispenser,
  resolveOnDuty,
  nextAfter,
} from '@/lib/rotation-queue'
import { nextAssigneeForDispenser } from '@/lib/rotation'
import { serializeTask } from '@/lib/serialize'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()

    const dispenser = await db.dispenser.findUnique({ where: { id } })
    if (!dispenser) throw new HttpError(404, 'Dispenser not found')
    if (!dispenser.isActive) throw new HttpError(409, 'This dispenser is inactive')

    // Rotation queue (if the admin set one up) decides who handles it.
    const queue = await loadQueueByDispenser(id)
    let nextId: string | null = null
    if (queue) {
      const onDuty = resolveOnDuty(queue.members, queue.currentUserId)
      // Nobody on duty (all inactive/empty queue) → fall back to the first next person.
      const assignee = onDuty ?? nextAfter(queue.members, null)
      nextId = assignee?.userId ?? null
    }
    if (!nextId) {
      // No queue (or no active members in it) → completion-driven schedule
      // rotation; last resort: any active user (someone must handle it).
      nextId = await nextAssigneeForDispenser(id)
    }
    if (!nextId) {
      throw new HttpError(
        409,
        'Nobody available — set up a rotation or schedule for this dispenser first'
      )
    }
    const now = Date.now()
    const open = await db.refillTask.findFirst({
      where: {
        dispenserId: id,
        status: 'PENDING',
        dueAt: { gte: new Date(now - 3 * 3600_000), lte: new Date(now + 6 * 3600_000) },
      },
      include: { dispenser: true, assignedTo: true },
    })
    if (open) {
      const who = open.assignedTo ? open.assignedTo.name : 'a teammate'
      throw new HttpError(
        409,
        `A refill is already queued — ${who} is on it (due ${formatDateTime(open.dueAt)})`
      )
    }

    // Due 2 hours from now (Shanghai wall clock), clamped to the end of day.
    const due = shanghaiParts(new Date(now + 2 * 3600_000))
    const hh = Math.min(due.hh, 23)
    const mm = due.hh >= 24 ? 59 : due.mm
    const dueTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

    // Reuse the schedule pipeline so generation, history and admin tooling
    // all see this task like any other: create a one-off SINGLE schedule.
    const schedule = await db.schedule.create({
      data: {
        dispenserId: id,
        recurrence: 'SINGLE',
        startDate: dayStartUtc(todayStr()),
        dueTime,
        assignedToId: nextId,
        createdById: user.id,
      },
    })

    await ensureTasksUpToDate(true)

    const task = await db.refillTask.findFirst({
      where: { scheduleId: schedule.id },
      include: { dispenser: true, assignedTo: true },
    })
    if (!task) throw new HttpError(500, 'Refill task could not be generated')

    return Response.json({ task: serializeTask(task) })
  } catch (e) {
    return errorResponse(e)
  }
}
