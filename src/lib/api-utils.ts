// Shared API helpers: JSON body parsing, per-member counts, rotation helpers
import { z } from 'zod'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'

/** Parse a JSON request body and validate it with zod; 400 on bad JSON or schema failure */
export async function parseJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<z.output<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid request body'
    throw new HttpError(400, message)
  }
  return result.data
}

/** DONE + PENDING task counts assigned to one user */
export async function memberCounts(
  userId: string
): Promise<{ doneCount: number; openCount: number }> {
  const [doneCount, openCount] = await Promise.all([
    db.refillTask.count({ where: { assignedToId: userId, status: 'DONE' } }),
    db.refillTask.count({ where: { assignedToId: userId, status: 'PENDING' } }),
  ])
  return { doneCount, openCount }
}

/** DONE + PENDING counts for every user, keyed by userId */
export async function memberCountMaps(): Promise<{
  done: Map<string, number>
  open: Map<string, number>
}> {
  const [doneGroups, openGroups] = await Promise.all([
    db.refillTask.groupBy({
      by: ['assignedToId'],
      where: { status: 'DONE', assignedToId: { not: null } },
      _count: { _all: true },
    }),
    db.refillTask.groupBy({
      by: ['assignedToId'],
      where: { status: 'PENDING', assignedToId: { not: null } },
      _count: { _all: true },
    }),
  ])
  const done = new Map<string, number>()
  for (const g of doneGroups) if (g.assignedToId) done.set(g.assignedToId, g._count._all)
  const open = new Map<string, number>()
  for (const g of openGroups) if (g.assignedToId) open.set(g.assignedToId, g._count._all)
  return { done, open }
}

/** Parse the Schedule.rotationMembers JSON column into a string[] of user ids */
export function parseRotationIds(json: string | null): string[] {
  if (!json) return []
  try {
    const arr: unknown = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/** Lookup { id, name } for the given user ids, preserving input order */
export async function resolveRotationMembers(ids: string[]) {
  if (ids.length === 0) return []
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  return ids.flatMap((id) => {
    const name = nameById.get(id)
    return name ? [{ id, name }] : []
  })
}
