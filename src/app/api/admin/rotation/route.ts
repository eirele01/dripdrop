// POST /api/admin/rotation — (re)create the Live Rotation Queue for a dispenser
// (one queue per dispenser). Queues are auto-provisioned elsewhere, so this is
// mainly a "restore" path — it seeds members with the active member pool.
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { ensureQueueForDispenser, buildQueueDTO, loadQueueByDispenser } from '@/lib/rotation-queue'

const createSchema = z.object({
  dispenserId: z.string().min(1, 'Dispenser is required'),
})

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    const body = await parseJsonBody(req, createSchema)

    const dispenser = await db.dispenser.findUnique({ where: { id: body.dispenserId } })
    if (!dispenser) throw new HttpError(404, 'Dispenser not found')

    const existing = await db.rotationQueue.findUnique({ where: { dispenserId: body.dispenserId } })
    if (existing) throw new HttpError(409, 'This dispenser already has a rotation queue')

    // Creates the queue AND seeds it with the active members (A→Z by default).
    await ensureQueueForDispenser(body.dispenserId)
    const queue = await loadQueueByDispenser(body.dispenserId)
    if (!queue) throw new HttpError(500, 'Rotation queue could not be created')

    return Response.json({ queue: await buildQueueDTO(queue, admin.id) })
  } catch (e) {
    return errorResponse(e)
  }
}
