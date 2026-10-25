import { requireUser, errorResponse } from '@/lib/auth'
import { db } from '@/lib/db'
import { serializeDispenser } from '@/lib/serialize'

export async function GET() {
  try {
    await requireUser()
    const dispensers = await db.dispenser.findMany({ orderBy: { name: 'asc' } })
    return Response.json({ dispensers: dispensers.map(serializeDispenser) })
  } catch (e) {
    return errorResponse(e)
  }
}
