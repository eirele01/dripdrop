import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, errorResponse } from '@/lib/auth'
import { parseJsonBody } from '@/lib/api-utils'
import { serializeDispenser } from '@/lib/serialize'

const createSchema = z.object({
  name: z.string().min(2),
  location: z.string().nullish(),
})

export async function GET() {
  try {
    await requireAdmin()
    const dispensers = await db.dispenser.findMany({ orderBy: { name: 'asc' } })
    return Response.json({ dispensers: dispensers.map(serializeDispenser) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await parseJsonBody(req, createSchema)
    const dispenser = await db.dispenser.create({
      data: {
        name: body.name.trim(),
        location: body.location?.trim() || null,
      },
    })
    // NOTE: no rotation queue is created here — rotation is OPT-IN per
    // dispenser. It gets set up when the admin enables it in the Rotation
    // console or creates a rotation schedule for this dispenser.
    return Response.json({ dispenser: serializeDispenser(dispenser) })
  } catch (e) {
    return errorResponse(e)
  }
}
