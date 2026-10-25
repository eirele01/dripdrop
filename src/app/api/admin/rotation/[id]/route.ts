// DELETE /api/admin/rotation/[id] — delete a rotation queue (members and
// turns cascade via schema onDelete rules).
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params

    const queue = await db.rotationQueue.findUnique({ where: { id } })
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    await db.rotationQueue.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
