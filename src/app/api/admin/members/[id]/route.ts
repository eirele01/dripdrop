import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody, memberCounts } from '@/lib/api-utils'
import { serializeMember } from '@/lib/serialize'

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = await requireAdmin()
    const body = await parseJsonBody(req, patchSchema)

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Member not found')

    const data: { name?: string; passwordHash?: string; role?: string; isActive?: boolean } = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (name.length < 2) throw new HttpError(400, 'Name is too short')
      data.name = name
    }

    if (body.role !== undefined) {
      if (id === admin.id && body.role !== 'ADMIN') {
        throw new HttpError(400, 'Cannot change your own role')
      }
      data.role = body.role
    }

    if (body.isActive !== undefined) {
      if (id === admin.id && body.isActive === false) {
        throw new HttpError(400, 'Cannot deactivate yourself')
      }
      data.isActive = body.isActive
    }

    if (body.password) {
      data.passwordHash = await hashPassword(body.password)
    }

    if (Object.keys(data).length === 0) {
      throw new HttpError(400, 'Nothing to update')
    }

    const updated = await db.user.update({ where: { id }, data })
    const counts = await memberCounts(updated.id)

    return Response.json({
      member: serializeMember({
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        doneCount: counts.doneCount,
        openCount: counts.openCount,
      })
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = await requireAdmin()

    if (id === admin.id) {
      throw new HttpError(400, 'Cannot delete yourself')
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Member not found')

    const [sessionCount, taskCount, rotationTurnCount] = await Promise.all([
      db.session.count({ where: { userId: id } }),
      db.refillTask.count({ where: { assignedToId: id } }),
      db.rotationTurn.count({ where: { userId: id } }),
    ])

    if (sessionCount > 0 || taskCount > 0 || rotationTurnCount > 0) {
      throw new HttpError(
        400,
        'Cannot delete member with existing sessions, completed tasks, or rotation turns. Deactivate them instead.',
      )
    }

    await db.user.delete({ where: { id } })

    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

