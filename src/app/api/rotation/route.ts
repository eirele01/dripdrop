// GET /api/rotation — all Live Rotation Queues, as seen by the signed-in user.
// The person-chain ("whose turn is it?") advances ONLY when someone acts
// (refill/skip) — no dates. Rotation is OPT-IN per dispenser: queues exist
// only where an admin enabled them (explicitly, or via a rotation schedule).
// Dispensers without a queue simply don't appear here.
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'
import { buildAllQueueDTOs } from '@/lib/rotation-queue'

export async function GET() {
  try {
    const user = await requireUser()

    const queues = await db.rotationQueue.findMany({
      include: { dispenser: true, members: { include: { user: true } } },
      orderBy: { dispenser: { name: 'asc' } },
    })
    const queuesDto = await buildAllQueueDTOs(queues, user.id)
    return Response.json({ queues: queuesDto })
  } catch (e) {
    return errorResponse(e)
  }
}
