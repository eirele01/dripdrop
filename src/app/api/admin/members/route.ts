import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody, memberCountMaps } from '@/lib/api-utils'
import { serializeMember } from '@/lib/serialize'

const createSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(6),
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
})

export async function GET() {
  try {
    await requireAdmin()
    const [users, { done, open }] = await Promise.all([
      db.user.findMany({ orderBy: { name: 'asc' } }),
      memberCountMaps(),
    ])
    return Response.json({
      members: users.map((u) =>
        serializeMember({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          doneCount: done.get(u.id) ?? 0,
          openCount: open.get(u.id) ?? 0,
        })
      ),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await parseJsonBody(req, createSchema)
    const email = body.email.trim().toLowerCase()

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new HttpError(409, 'Email is already in use')

    const user = await db.user.create({
      data: {
        name: body.name.trim(),
        email,
        passwordHash: hashPassword(body.password),
        role: body.role ?? 'MEMBER',
      },
    })

    return Response.json({
      member: serializeMember({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        doneCount: 0,
        openCount: 0,
      }),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
