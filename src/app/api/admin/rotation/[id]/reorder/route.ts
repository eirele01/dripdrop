// POST /api/admin/rotation/[id]/reorder — move a member up/down one spot by
// swapping positions with their neighbor in that direction.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { loadQueue, sortMembers, reloadQueue, buildQueueDTO } from '@/lib/rotation-queue'

const reorderSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  direction: z.enum(['up', 'down']),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const body = await parseJsonBody(req, reorderSchema)

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    const sorted = sortMembers(queue.members)
    const idx = sorted.findIndex((m) => m.userId === body.userId)
    if (idx === -1) throw new HttpError(404, 'Not in the rotation')

    const swapIdx = body.direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0) throw new HttpError(409, 'Already at the top')
    if (swapIdx >= sorted.length) throw new HttpError(409, 'Already at the bottom')

    const mover = sorted[idx]
    const neighbor = sorted[swapIdx]
    await db.$transaction([
      db.rotationMember.update({ where: { id: mover.id }, data: { position: neighbor.position } }),
      db.rotationMember.update({ where: { id: neighbor.id }, data: { position: mover.position } }),
    ])

    const fresh = await reloadQueue(id)
    return Response.json({ queue: await buildQueueDTO(fresh, admin.id) })
  } catch (e) {
    return errorResponse(e)
  }
}
