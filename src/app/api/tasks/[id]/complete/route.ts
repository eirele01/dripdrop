import { db } from '@/lib/db'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import { serializeTask } from '@/lib/serialize'
import { rebalanceScheduleAfterCompletion, successorOf } from '@/lib/rotation'
import { recordTurnForTask } from '@/lib/rotation-queue'
import { parseRotationIds } from '@/lib/api-utils'
import { s3Upload } from '@/lib/s3'

const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10MB
const WATER_LEVELS: readonly string[] = ['FULL', 'HALF', 'EMPTY']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new HttpError(400, 'Expected multipart/form-data body')
    }

    const task = await db.refillTask.findUnique({ where: { id } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.assignedToId !== user.id) {
      throw new HttpError(403, 'You can only complete your own tasks')
    }
    if (task.status !== 'PENDING') {
      throw new HttpError(409, 'Only pending tasks can be completed')
    }

    const photo = form.get('photo')
    if (!photo || typeof photo === 'string') throw new HttpError(400, 'Photo is required')
    if (!photo.type.startsWith('image/')) {
      throw new HttpError(400, 'Photo must be an image file')
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      throw new HttpError(400, 'Photo must be 10MB or smaller')
    }

    const waterLevelRaw = ((form.get('waterLevel') as string | null) ?? '').trim()
    if (waterLevelRaw && !WATER_LEVELS.includes(waterLevelRaw)) {
      throw new HttpError(400, 'Invalid water level (expected FULL, HALF or EMPTY)')
    }

    const noteRaw = ((form.get('note') as string | null) ?? '').trim()
    if (noteRaw.length > 500) {
      throw new HttpError(400, 'Note must be 500 characters or fewer')
    }

    const photoBuffer = Buffer.from(await photo.arrayBuffer())
    const filename = `${task.id}-${Date.now()}.jpg`
    const proofPath = await s3Upload(`proofs/${filename}`, photoBuffer, photo.type)

    const updated = await db.refillTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        proofPath,
        waterLevel: waterLevelRaw || null,
        note: noteRaw || null,
      },
      include: { dispenser: true, assignedTo: true },
    })

    // Completion-driven rotation: re-sequence this schedule's upcoming shifts
    // so the next one goes to the person after the completer.
    const shifted = await rebalanceScheduleAfterCompletion({
      scheduleId: task.scheduleId,
      dueAt: task.dueAt,
      assignedToId: user.id,
    })

    // Live rotation (the person-chain, no dates): completing the task records
    // a turn for the COMPLETER and instantly advances the dispenser's queue
    // pointer to their successor. Works no matter which system created the task.
    const rotation = await recordTurnForTask({
      dispenserId: task.dispenserId,
      completerId: user.id,
      taskId: task.id,
      proofPath,
      waterLevel: waterLevelRaw || null,
      note: noteRaw || null,
    })

    let nextUp: { id: string; name: string } | null =
      rotation?.next ? { id: rotation.next.userId, name: rotation.next.name } : null
    if (!nextUp && task.scheduleId) {
      const schedule = await db.schedule.findUnique({ where: { id: task.scheduleId } })
      if (schedule) {
        const scheduleRotation = parseRotationIds(schedule.rotationMembers)
        const nextId = successorOf(scheduleRotation, user.id)
        if (nextId) {
          const u = await db.user.findUnique({
            where: { id: nextId },
            select: { id: true, name: true },
          })
          nextUp = u
        }
      }
    }

    return Response.json({ task: serializeTask(updated), nextUp, shifted })
  } catch (e) {
    return errorResponse(e)
  }
}
