// DELETE /api/admin/rotation/[id]/members/[userId] — remove a member,
// resequence the remaining positions 0..n-1, and if the removed user was on
// duty hand the turn to the next active member after them (or clear it).
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { loadQueue, sortMembers, nextAfter, reloadQueue, buildQueueDTO } from '@/lib/rotation-queue'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id, userId } = await params

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    const member = queue.members.find((m) => m.userId === userId)
    if (!member) throw new HttpError(404, 'Not in the rotation')

    // Next active member AFTER the removed one — computed on the full member
    // list BEFORE deletion, so the cyclic walk starts from their position.
    const next = nextAfter(queue.members, userId)
    const remaining = sortMembers(queue.members).filter((m) => m.userId !== userId)

    await db.$transaction([
      db.rotationMember.delete({ where: { queueId_userId: { queueId: id, userId } } }),
      ...remaining.map((m, i) =>
        db.rotationMember.update({ where: { id: m.id }, data: { position: i } })
      ),
    ])

    // Only move the pointer when the removed user was the one on duty.
    if (queue.currentUserId === userId) {
      await db.rotationQueue.update({
        where: { id },
        data: { currentUserId: next?.userId ?? null },
      })
    }

    const fresh = await reloadQueue(id)
    return Response.json({ queue: await buildQueueDTO(fresh, admin.id) })
  } catch (e) {
    return errorResponse(e)
  }
}
