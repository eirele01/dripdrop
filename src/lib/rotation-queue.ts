// Live Rotation Queue ("whose turn is it right now?") — standalone from the
// date/time Schedule system. A queue is an ordered list of members plus a
// turn pointer. There are NO due dates: after a refill (or a skip) is logged,
// the pointer instantly advances to the next active member, so the same
// dispenser can be refilled any number of times per day.
//
// Inactive members are kept in their position but skipped when resolving
// whose turn it is, so pausing someone never breaks the cycle.
import { db } from '@/lib/db'
import { HttpError } from '@/lib/auth'
import type { Dispenser, RotationMember, RotationQueue, User } from '@prisma/client'
import type { RotationQueueDTO, RotationMemberDTO, RotationTurnDTO, WaterLevel } from '@/lib/types'
import { dayStartUtc, todayStr } from '@/lib/tz'

export type MemberWithUser = RotationMember & { user: User }
export type QueueWithMembers = RotationQueue & {
  dispenser: Dispenser
  members: MemberWithUser[]
}

/** Members ordered by position (stable tiebreak on id). */
export function sortMembers(members: MemberWithUser[]): MemberWithUser[] {
  return [...members].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/**
 * The person on duty right now: starts at the stored pointer position and
 * walks forward (cyclically) to the first ACTIVE member. A null/stale pointer
 * falls back to the first active member in order.
 */
export function resolveOnDuty(
  members: MemberWithUser[],
  currentUserId: string | null
): MemberWithUser | null {
  const sorted = sortMembers(members)
  if (sorted.length === 0) return null
  const startIdx = currentUserId ? sorted.findIndex((m) => m.userId === currentUserId) : -1
  if (startIdx === -1) return sorted.find((m) => m.user.isActive) ?? null
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[(startIdx + i) % sorted.length]
    if (m.user.isActive) return m
  }
  return null
}

/** Next ACTIVE member strictly after `userId` in the cycle (null userId → first active). */
export function nextAfter(
  members: MemberWithUser[],
  userId: string | null
): MemberWithUser | null {
  const sorted = sortMembers(members)
  if (sorted.length === 0) return null
  const idx = userId ? sorted.findIndex((m) => m.userId === userId) : -1
  if (idx === -1) return sorted.find((m) => m.user.isActive) ?? null
  for (let i = 1; i <= sorted.length; i++) {
    const m = sorted[(idx + i) % sorted.length]
    if (m.user.isActive) return m
  }
  return null
}

export async function loadQueue(queueId: string): Promise<QueueWithMembers | null> {
  return db.rotationQueue.findUnique({
    where: { id: queueId },
    include: { dispenser: true, members: { include: { user: true } } },
  })
}

/**
 * Permission for refill/skip: the on-duty member themselves, or an admin
 * (acting on their behalf). Throws 403/409 otherwise.
 */
export function assertCanAct(
  user: { id: string; role: string },
  onDuty: MemberWithUser | null
): void {
  if (user.role === 'ADMIN') return
  if (!onDuty) throw new HttpError(409, 'No active members in this rotation queue')
  if (onDuty.userId !== user.id) {
    throw new HttpError(
      403,
      `It's ${onDuty.user.name}'s turn — only they (or an admin) can log this`
    )
  }
}

/**
 * Record a turn (DONE refill or SKIPPED) for the on-duty person and advance
 * the pointer to their successor — atomically in one transaction.
 * Returns the created turn and the person who is now on duty.
 */
export async function recordTurnAndAdvance(opts: {
  queue: QueueWithMembers
  turnUserId: string // whose turn it was (may differ from the actor when admin acts on behalf)
  status: 'DONE' | 'SKIPPED'
  proofPath?: string | null
  waterLevel?: string | null
  note?: string | null
}): Promise<{ turnId: string; next: MemberWithUser | null }> {
  const { queue, turnUserId, status } = opts
  return db.$transaction(async (tx) => {
    const turn = await tx.rotationTurn.create({
      data: {
        queueId: queue.id,
        userId: turnUserId,
        status,
        proofPath: opts.proofPath ?? null,
        waterLevel: opts.waterLevel ?? null,
        note: opts.note ?? null,
      },
    })
    const next = nextAfter(queue.members, turnUserId)
    await tx.rotationQueue.update({
      where: { id: queue.id },
      data: { currentUserId: next?.userId ?? null },
    })
    return { turnId: turn.id, next }
  })
}

/** Freshly-loaded queue for building a post-action DTO (next on duty etc.). */
export async function reloadQueue(queueId: string): Promise<QueueWithMembers> {
  const queue = await loadQueue(queueId)
  if (!queue) throw new HttpError(404, 'Rotation queue not found')
  return queue
}

// ---------------------------------------------------------------------------
// Provisioning — queues are OPT-IN per dispenser. One is created only when an
// admin enables rotation explicitly (POST /api/admin/rotation) or creates a
// rotation schedule for that dispenser (seeding exactly the picked order).
// ---------------------------------------------------------------------------

const DEFAULT_SEED_ORDER: { name: 'asc' }[] = [{ name: 'asc' }]

/** Ordered ids of the default seed pool: active MEMBER users by name (admins excluded unless there is nobody else). */
async function defaultSeedIds(): Promise<string[]> {
  const members = await db.user.findMany({
    where: { isActive: true, role: 'MEMBER' },
    orderBy: DEFAULT_SEED_ORDER,
    select: { id: true },
  })
  if (members.length > 0) return members.map((u) => u.id)
  const anyone = await db.user.findMany({
    where: { isActive: true },
    orderBy: DEFAULT_SEED_ORDER,
    select: { id: true },
  })
  return anyone.map((u) => u.id)
}

/** Create the queue for a dispenser if it does not exist yet (idempotent). Seeds members when empty-ish. */
export async function ensureQueueForDispenser(
  dispenserId: string,
  seedOrderIds?: string[]
): Promise<QueueWithMembers> {
  const existing = await loadQueueByDispenser(dispenserId)
  if (existing) {
    if (existing.members.length === 0) {
      const seed = seedOrderIds?.length ? seedOrderIds : await defaultSeedIds()
      if (seed.length > 0) await replaceMembers(existing.id, seed, null)
      return (await loadQueueByDispenser(dispenserId))!
    }
    return existing
  }
  const queue = await db.rotationQueue.create({ data: { dispenserId } })
  const seed = seedOrderIds?.length ? seedOrderIds : await defaultSeedIds()
  if (seed.length > 0) await replaceMembers(queue.id, seed, null)
  return (await loadQueueByDispenser(dispenserId))!
}

/** Load a dispenser's queue (members included) WITHOUT creating one — null when none exists. */
export async function loadQueueByDispenser(dispenserId: string): Promise<QueueWithMembers | null> {
  return db.rotationQueue.findUnique({
    where: { dispenserId },
    include: { dispenser: true, members: { include: { user: true } } },
  })
}

/** Replace the member list with `orderedIds` (validated), preserving the pointer when still valid. */
async function replaceMembers(
  queueId: string,
  orderedIds: string[],
  keepPointerUserId: string | null
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.rotationMember.deleteMany({ where: { queueId } })
    const valid = await tx.user.findMany({
      where: { id: { in: orderedIds } },
      select: { id: true },
    })
    const validIds = new Set(valid.map((u) => u.id))
    let pos = 0
    for (const userId of orderedIds) {
      if (!validIds.has(userId)) continue
      await tx.rotationMember.create({ data: { queueId, userId, position: pos++ } })
    }
    // Keep the pointer only if that user is still an active member of the queue.
    let nextPointer: string | null = null
    if (keepPointerUserId) {
      const kept = await tx.rotationMember.findFirst({
        where: { queueId, userId: keepPointerUserId, user: { isActive: true } },
        select: { id: true },
      })
      nextPointer = kept ? keepPointerUserId : null
    }
    await tx.rotationQueue.update({ where: { id: queueId }, data: { currentUserId: nextPointer } })
  })
}

/**
 * Sync a dispenser's queue turn-order from an admin-defined rotation
 * (e.g. the order picked when creating a schedule). The queue stays the
 * single source of truth for "who's next"; this just realigns the order.
 */
export async function syncQueueOrder(dispenserId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  const queue = await loadQueueByDispenser(dispenserId)
  if (!queue) return
  const currentOrder = sortMembers(queue.members).map((m) => m.userId)
  const sameOrder =
    currentOrder.length === orderedIds.length && orderedIds.every((id, i) => id === currentOrder[i])
  if (sameOrder) return
  await replaceMembers(queue.id, orderedIds, queue.currentUserId)
}

/**
 * Advance the queue when a RefillTask is completed. The turn is attributed to
 * the COMPLETER (not necessarily whoever the pointer was on) and the pointer
 * moves to their successor — "based on the person who finished the task".
 * Returns the fresh queue + next person, or null when the completer is not in
 * the queue / the dispenser has no queue (nothing to advance).
 */
export async function recordTurnForTask(opts: {
  dispenserId: string
  completerId: string
  taskId: string
  proofPath?: string | null
  waterLevel?: string | null
  note?: string | null
}): Promise<{ queueId: string; next: { userId: string; name: string } | null } | null> {
  const queue = await loadQueueByDispenser(opts.dispenserId)
  if (!queue) return null
  const member = queue.members.find((m) => m.userId === opts.completerId)
  if (!member || !member.user.isActive) return null

  await db.$transaction(async (tx) => {
    // Idempotent: a task can only ever create one linked turn.
    const existing = await tx.rotationTurn.findFirst({ where: { taskId: opts.taskId } })
    if (!existing) {
      await tx.rotationTurn.create({
        data: {
          queueId: queue.id,
          userId: opts.completerId,
          status: 'DONE',
          proofPath: opts.proofPath ?? null,
          waterLevel: opts.waterLevel ?? null,
          note: opts.note ?? null,
          taskId: opts.taskId,
        },
      })
    }
    const next = nextAfter(queue.members, opts.completerId)
    await tx.rotationQueue.update({
      where: { id: queue.id },
      data: { currentUserId: next?.userId ?? null },
    })
    return next
  })

  const fresh = await loadQueueByDispenser(opts.dispenserId)
  const onDuty = fresh ? resolveOnDuty(fresh.members, fresh.currentUserId) : null
  return {
    queueId: queue.id,
    next: onDuty ? { userId: onDuty.userId, name: onDuty.user.name } : null,
  }
}

function serializeTurn(
  t: { id: string; status: string; proofPath: string | null; waterLevel: string | null; note: string | null; createdAt: Date; user: User }
): RotationTurnDTO {
  return {
    id: t.id,
    status: t.status as 'DONE' | 'SKIPPED',
    userName: t.user.name,
    proofPath: t.proofPath,
    waterLevel: (t.waterLevel as WaterLevel | null) ?? null,
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  }
}

/** Build the API DTO for one queue as seen by `viewerId` (drives isMyTurn). */
export async function buildQueueDTO(
  queue: QueueWithMembers,
  viewerId: string
): Promise<RotationQueueDTO> {
  const onDuty = resolveOnDuty(queue.members, queue.currentUserId)
  const next = onDuty ? nextAfter(queue.members, onDuty.userId) : null

  const [recent, totalTurns, todayTurns, turnTotals, turnsTodayRows] = await Promise.all([
    db.rotationTurn.findMany({
      where: { queueId: queue.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { user: true },
    }),
    db.rotationTurn.count({ where: { queueId: queue.id } }),
    db.rotationTurn.count({
      where: { queueId: queue.id, createdAt: { gte: dayStartUtc(todayStr()) } },
    }),
    db.rotationTurn.groupBy({
      by: ['userId'],
      where: { queueId: queue.id },
      _count: { _all: true },
    }),
    db.rotationTurn.groupBy({
      by: ['userId'],
      where: { queueId: queue.id, createdAt: { gte: dayStartUtc(todayStr()) } },
      _count: { _all: true },
    }),
  ])

  const totalByUser = new Map(turnTotals.map((g) => [g.userId, g._count._all]))
  const todayByUser = new Map(turnsTodayRows.map((g) => [g.userId, g._count._all]))

  const sorted = sortMembers(queue.members)
  const members: RotationMemberDTO[] = sorted.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    position: m.position,
    isActive: m.user.isActive,
    isOnDuty: onDuty?.userId === m.userId,
    turnsToday: todayByUser.get(m.userId) ?? 0,
    turnsTotal: totalByUser.get(m.userId) ?? 0,
  }))

  return {
    id: queue.id,
    dispenser: {
      id: queue.dispenser.id,
      name: queue.dispenser.name,
      location: queue.dispenser.location,
      isActive: queue.dispenser.isActive,
    },
    members,
    onDuty: onDuty ? { userId: onDuty.userId, name: onDuty.user.name } : null,
    isMyTurn: onDuty?.userId === viewerId,
    nextUp: next ? { userId: next.userId, name: next.user.name } : null,
    todayTurns,
    totalTurns,
    recentTurns: recent.map(serializeTurn),
  }
}

/**
 * Batched variant of buildQueueDTO for the GET /api/rotation list: the four
 * aggregate queries run ONCE across all queues (grouped by queueId+userId)
 * instead of 4×N times. Recent turns still load per queue (limit 6 each).
 */
export async function buildAllQueueDTOs(
  queues: QueueWithMembers[],
  viewerId: string
): Promise<RotationQueueDTO[]> {
  if (queues.length === 0) return []
  const ids = queues.map((q) => q.id)
  const dayStart = dayStartUtc(todayStr())

  const [turnTotals, turnsTodayRows, recentByQueue] = await Promise.all([
    db.rotationTurn.groupBy({
      by: ['queueId', 'userId'],
      where: { queueId: { in: ids } },
      _count: { _all: true },
    }),
    db.rotationTurn.groupBy({
      by: ['queueId', 'userId'],
      where: { queueId: { in: ids }, createdAt: { gte: dayStart } },
      _count: { _all: true },
    }),
    Promise.all(
      queues.map((q) =>
        db.rotationTurn.findMany({
          where: { queueId: q.id },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: { user: true },
        })
      )
    ),
  ])

  const totals = new Map<string, number>()
  const todays = new Map<string, number>()
  for (const g of turnTotals) {
    totals.set(g.queueId, (totals.get(g.queueId) ?? 0) + g._count._all)
  }
  for (const g of turnsTodayRows) {
    todays.set(g.queueId, (todays.get(g.queueId) ?? 0) + g._count._all)
  }
  const totalsByUser = new Map<string, number>()
  const todayByUser = new Map<string, number>()
  for (const g of turnTotals) {
    totalsByUser.set(`${g.queueId}|${g.userId}`, g._count._all)
  }
  for (const g of turnsTodayRows) {
    todayByUser.set(`${g.queueId}|${g.userId}`, g._count._all)
  }

  return queues.map((queue, i) => {
    const onDuty = resolveOnDuty(queue.members, queue.currentUserId)
    const next = onDuty ? nextAfter(queue.members, onDuty.userId) : null
    const sorted = sortMembers(queue.members)

    const members: RotationMemberDTO[] = sorted.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      position: m.position,
      isActive: m.user.isActive,
      isOnDuty: onDuty?.userId === m.userId,
      turnsToday: todayByUser.get(`${queue.id}|${m.userId}`) ?? 0,
      turnsTotal: totalsByUser.get(`${queue.id}|${m.userId}`) ?? 0,
    }))

    return {
      id: queue.id,
      dispenser: {
        id: queue.dispenser.id,
        name: queue.dispenser.name,
        location: queue.dispenser.location,
        isActive: queue.dispenser.isActive,
      },
      members,
      onDuty: onDuty ? { userId: onDuty.userId, name: onDuty.user.name } : null,
      isMyTurn: onDuty?.userId === viewerId,
      nextUp: next ? { userId: next.userId, name: next.user.name } : null,
      todayTurns: todays.get(queue.id) ?? 0,
      totalTurns: totals.get(queue.id) ?? 0,
      recentTurns: recentByQueue[i].map(serializeTurn),
    }
  })
}
