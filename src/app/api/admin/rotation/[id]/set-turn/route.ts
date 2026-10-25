// POST /api/admin/rotation/[id]/set-turn — manually set whose turn it is.
// userId must be a queue member; null clears the pointer (resolves to the
// first active member).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { loadQueue, reloadQueue, buildQueueDTO } from '@/lib/rotation-queue'

const setTurnSchema = z.object({
  userId: z.string().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const body = await parseJsonBody(req, setTurnSchema)

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    if (body.userId !== null) {
      const member = await db.rotationMember.findUnique({
        where: { queueId_userId: { queueId: id, userId: body.userId } },
      })
      if (!member) throw new HttpError(400, 'That member is not in the rotation')
    }

    await db.rotationQueue.update({
      where: { id },
      data: { currentUserId: body.userId },
    })

    const fresh = await reloadQueue(id)
    return Response.json({ queue: await buildQueueDTO(fresh, admin.id) })
  } catch (e) {
    return errorResponse(e)
  }
}
