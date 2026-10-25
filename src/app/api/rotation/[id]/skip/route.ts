// POST /api/rotation/[id]/skip — the on-duty person passes their turn; the
// pointer advances to the next active member immediately. Same permission as
// refill (on-duty user themselves, or an admin acting on their behalf).
import { z } from 'zod'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import {
  loadQueue,
  resolveOnDuty,
  assertCanAct,
  recordTurnAndAdvance,
  reloadQueue,
  buildQueueDTO,
} from '@/lib/rotation-queue'

const skipSchema = z.object({
  note: z.string().max(300, 'Note must be 300 characters or fewer').optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()
    const body = await parseJsonBody(req, skipSchema)

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    const onDuty = resolveOnDuty(queue.members, queue.currentUserId)
    assertCanAct(user, onDuty)
    if (!onDuty) throw new HttpError(409, 'No active members in this rotation queue')

    const { turnId } = await recordTurnAndAdvance({
      queue,
      turnUserId: onDuty.userId, // the skip belongs to the on-duty user, not the actor
      status: 'SKIPPED',
      note: body.note?.trim() || null,
    })

    const fresh = await reloadQueue(id)
    return Response.json({
      turn: { id: turnId, status: 'SKIPPED' },
      queue: await buildQueueDTO(fresh, user.id),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
