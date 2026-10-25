import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseRecurrence, dayStartUtc } from '@/lib/tz'
import { ensureTasksUpToDate } from '@/lib/task-generator'
import { parseJsonBody, parseRotationIds, resolveRotationMembers } from '@/lib/api-utils'
import { nextUpForSchedules } from '@/lib/rotation'
import { ensureQueueForDispenser, syncQueueOrder } from '@/lib/rotation-queue'
import { serializeSchedule } from '@/lib/serialize'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const createSchema = z.object({
  dispenserId: z.string().min(1),
  recurrence: z.string().min(1),
  startDate: z.string().regex(DATE_RE, 'startDate must be a YYYY-MM-DD date'),
  endDate: z.string().regex(DATE_RE, 'endDate must be a YYYY-MM-DD date').nullish(),
  dueTime: z.string().regex(TIME_RE, 'dueTime must be HH:mm between 00:00 and 23:59'),
  assignedToId: z.string().min(1).nullish(),
  rotationMemberIds: z.array(z.string().min(1)).nullish(),
})

export async function GET() {
  try {
    await requireAdmin()
    const schedules = await db.schedule.findMany({
      include: { dispenser: true, assignedTo: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    })

    // Resolve rotation member names in a single query
    const idSet = new Set<string>()
    for (const s of schedules) for (const id of parseRotationIds(s.rotationMembers)) idSet.add(id)
    const nameById = new Map(
      (
        await db.user.findMany({
          where: { id: { in: [...idSet] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name])
    )

    // Completion-driven rotation: compute "who is next" for each schedule
    const nextUpMap = await nextUpForSchedules(schedules)

    return Response.json({
      schedules: schedules.map((s) =>
        serializeSchedule(
          s,
          parseRotationIds(s.rotationMembers).flatMap((id) => {
            const name = nameById.get(id)
            return name ? [{ id, name }] : []
          }),
          nextUpMap.get(s.id) ?? null
        )
      ),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    const body = await parseJsonBody(req, createSchema)

    const dispenser = await db.dispenser.findUnique({ where: { id: body.dispenserId } })
    if (!dispenser) throw new HttpError(404, 'Dispenser not found')

    let parsed
    try {
      parsed = parseRecurrence(body.recurrence)
    } catch {
      throw new HttpError(400, 'Invalid recurrence (expected SINGLE, DAILY or WEEKLY:MON,TUE,...)')
    }
    const recurrence = parsed.kind === 'WEEKLY' ? `WEEKLY:${parsed.days.join(',')}` : parsed.kind

    if (body.endDate && body.endDate < body.startDate) {
      throw new HttpError(400, 'endDate must be on or after startDate')
    }

    const assignedToId = body.assignedToId ?? null
    const rotationIds = [...new Set(body.rotationMemberIds ?? [])]

    if (assignedToId && rotationIds.length > 0) {
      throw new HttpError(400, 'Choose either a fixed assignee or rotation members, not both')
    }
    if (!assignedToId && rotationIds.length === 0) {
      throw new HttpError(400, 'Provide assignedToId (fixed) or rotationMemberIds (rotation)')
    }

    if (assignedToId) {
      const assignee = await db.user.findUnique({ where: { id: assignedToId } })
      if (!assignee) throw new HttpError(400, 'Assigned user not found')
    } else {
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

    const schedule = await db.schedule.create({
      data: {
        dispenserId: body.dispenserId,
        recurrence,
        startDate: dayStartUtc(body.startDate),
        endDate: body.endDate ? dayStartUtc(body.endDate) : null,
        dueTime: body.dueTime,
        assignedToId: assignedToId ?? null,
        rotationMembers: rotationIds.length > 0 ? JSON.stringify(rotationIds) : null,
        createdById: admin.id,
      },
      include: { dispenser: true, assignedTo: true },
    })

    await ensureTasksUpToDate(true)

    // The picked order also drives the dispenser's live rotation queue, so the
    // person-chain ("who's next") matches what the admin defined here. This is
    // the opt-in point: only THIS dispenser gets a queue, seeded with exactly
    // the members the admin picked (never the whole member list).
    if (rotationIds.length >= 2) {
      await ensureQueueForDispenser(body.dispenserId, rotationIds)
      await syncQueueOrder(body.dispenserId, rotationIds)
    }

    return Response.json({
      schedule: serializeSchedule(schedule, await resolveRotationMembers(rotationIds)),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
