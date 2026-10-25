// POST /api/admin/rotation/[id]/members — append a member at the end of the
// rotation (position = max + 1).
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { loadQueue, reloadQueue, buildQueueDTO } from '@/lib/rotation-queue'

const addSchema = z.object({
  userId: z.string().min(1, 'User is required'),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const body = await parseJsonBody(req, addSchema)

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    const user = await db.user.findUnique({ where: { id: body.userId } })
    if (!user) throw new HttpError(404, 'User not found')

    const existing = await db.rotationMember.findUnique({
      where: { queueId_userId: { queueId: id, userId: body.userId } },
    })
    if (existing) throw new HttpError(409, 'Already in the rotation')

    const max = await db.rotationMember.aggregate({
      where: { queueId: id },
      _max: { position: true },
    })
    await db.rotationMember.create({
      data: { queueId: id, userId: body.userId, position: (max._max.position ?? -1) + 1 },
    })

    const fresh = await reloadQueue(id)
    return Response.json({ queue: await buildQueueDTO(fresh, admin.id) })
  } catch (e) {
    return errorResponse(e)
  }
}
