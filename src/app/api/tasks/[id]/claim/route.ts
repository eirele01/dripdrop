import { db } from '@/lib/db'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import { serializeTask } from '@/lib/serialize'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()

    const task = await db.refillTask.findUnique({ where: { id } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.status !== 'PENDING') {
      throw new HttpError(409, 'Only pending tasks can be claimed')
    }
    if (task.assignedToId !== null) {
      throw new HttpError(409, 'Task has already been claimed')
    }

    const updated = await db.refillTask.update({
      where: { id },
      data: { assignedToId: user.id },
      include: { dispenser: true, assignedTo: true },
    })

    return Response.json({ task: serializeTask(updated) })
  } catch (e) {
    return errorResponse(e)
  }
}
