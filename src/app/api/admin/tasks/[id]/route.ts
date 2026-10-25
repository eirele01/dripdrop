import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { combineToUtc, dateStrOf, shanghaiParts } from '@/lib/tz'
import { parseJsonBody } from '@/lib/api-utils'
import { serializeTask } from '@/lib/serialize'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const patchSchema = z.object({
  assignedToId: z.string().min(1).nullable().optional(),
  status: z.enum(['PENDING', 'DONE', 'MISSED']).optional(),
  // Edit the due moment as Shanghai wall-clock date + time (either or both).
  dueDate: z.string().regex(DATE_RE, 'dueDate must be a YYYY-MM-DD date').optional(),
  dueTime: z.string().regex(TIME_RE, 'dueTime must be HH:mm between 00:00 and 23:59').optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()
    const body = await parseJsonBody(req, patchSchema)

    const task = await db.refillTask.findUnique({ where: { id } })
    if (!task) throw new HttpError(404, 'Task not found')

    const data: {
      assignedToId?: string | null
      status?: 'PENDING' | 'DONE' | 'MISSED'
      completedAt?: Date | null
      dueAt?: Date
    } = {}

    if (body.assignedToId !== undefined) {
      if (body.assignedToId !== null) {
        const assignee = await db.user.findUnique({ where: { id: body.assignedToId } })
        if (!assignee) throw new HttpError(400, 'Assigned user not found')
      }
      data.assignedToId = body.assignedToId
    }

    if (body.status !== undefined) {
      data.status = body.status
      if (body.status === 'DONE' && task.completedAt === null) {
        // Admin override does not fabricate proof; just stamp completion time once
        data.completedAt = new Date()
      }
      if (body.status === 'PENDING' && task.completedAt !== null) {
        // Re-opening a finished task clears the completion stamp
        data.completedAt = null
      }
    }

    if (body.dueDate !== undefined || body.dueTime !== undefined) {
      const dateStr = body.dueDate ?? dateStrOf(task.dueAt)
      const p = shanghaiParts(task.dueAt)
      const timeStr =
        body.dueTime ?? `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`
      data.dueAt = combineToUtc(dateStr, timeStr)
    }

    const updated = await db.refillTask.update({
      where: { id },
      data,
      include: { dispenser: true, assignedTo: true },
    })

    return Response.json({ task: serializeTask(updated) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()

    const existing = await db.refillTask.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Task not found')

    await db.refillTask.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
