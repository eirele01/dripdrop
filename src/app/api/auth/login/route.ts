import { z } from 'zod'
import { db } from '@/lib/db'
import { createSession, verifyPassword, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const { email, password } = await parseJsonBody(req, loginSchema)
    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    })
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Invalid email or password')
    }
    await createSession(user.id)
    return Response.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
