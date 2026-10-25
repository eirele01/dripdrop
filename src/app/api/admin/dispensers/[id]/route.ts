import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { serializeDispenser } from '@/lib/serialize'

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  location: z.string().nullish(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()
    const body = await parseJsonBody(req, patchSchema)

    const existing = await db.dispenser.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Dispenser not found')

    const data: { name?: string; location?: string | null; isActive?: boolean } = {}
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.location !== undefined) data.location = body.location?.trim() || null
    if (body.isActive !== undefined) data.isActive = body.isActive

    const dispenser = await db.dispenser.update({ where: { id }, data })
    return Response.json({ dispenser: serializeDispenser(dispenser) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await requireAdmin()

    const existing = await db.dispenser.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Dispenser not found')

    // Prisma cascade removes its schedules and tasks too
    await db.dispenser.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
