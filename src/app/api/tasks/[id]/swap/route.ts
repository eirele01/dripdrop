import { db } from '@/lib/db'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import { serializeTask } from '@/lib/serialize'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()

    const task = await db.refillTask.findUnique({ where: { id } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.assignedToId !== user.id) {
      throw new HttpError(403, 'You can only swap your own tasks')
    }
    if (task.status !== 'PENDING') {
      throw new HttpError(409, 'Only pending tasks can be swapped')
    }

    const updated = await db.refillTask.update({
      where: { id },
      data: { assignedToId: null },
      include: { dispenser: true, assignedTo: true },
    })

    return Response.json({ task: serializeTask(updated) })
  } catch (e) {
    return errorResponse(e)
  }
}
