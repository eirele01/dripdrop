// Leaderboard helpers: per-user refill counts + streaks (shared by /api/stats/me and admin dashboard)
//
// A "refill" can happen through either path:
//  - a scheduled RefillTask marked DONE, or
//  - a Live Rotation turn (RotationTurn DONE) that was NOT created by a task
//    completion (taskId === null) — task completions already count above.
// The two are merged so the leaderboard reflects every actual refill exactly once.
import { db } from '@/lib/db'
import { doneDateSet, streakOf } from '@/lib/stats'
import { addDays, dayStartUtc, todayStr } from '@/lib/tz'
import type { LeaderDTO } from '@/lib/types'

const STREAK_WINDOW_DAYS = 60

export interface UserStats {
  doneCount: number
  streak: number
}

/**
 * doneCount (all-time refills) + streak (last 60 days) for every active user.
 * Used for the admin leaderboard and the member rank calculation.
 */
export async function activeUserStats(): Promise<LeaderDTO[]> {
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  const since = dayStartUtc(addDays(todayStr(), -(STREAK_WINDOW_DAYS - 1)))

  const [doneGroups, recentDone, turnGroups, recentTurns] = await Promise.all([
    // All-time DONE scheduled tasks per user
    db.refillTask.groupBy({
      by: ['assignedToId'],
      where: { status: 'DONE', assignedToId: { not: null } },
      _count: { _all: true },
    }),
    // Recent DONE tasks (for streaks)
    db.refillTask.findMany({
      where: { status: 'DONE', completedAt: { gte: since } },
      select: { assignedToId: true, completedAt: true },
    }),
    // All-time standalone rotation turns per user (task completions excluded —
    // they are already counted as tasks, and RotationTurn.taskId links them)
    db.rotationTurn.groupBy({
      by: ['userId'],
      where: { status: 'DONE', taskId: null },
      _count: { _all: true },
    }),
    // Recent standalone rotation turns (for streaks)
    db.rotationTurn.findMany({
      where: { status: 'DONE', taskId: null, createdAt: { gte: since } },
      select: { userId: true, createdAt: true },
    }),
  ])

  const taskCountById = new Map<string, number>()
  for (const g of doneGroups) if (g.assignedToId) taskCountById.set(g.assignedToId, g._count._all)
  const turnCountById = new Map<string, number>()
  for (const g of turnGroups) turnCountById.set(g.userId, g._count._all)

  const completionsById = new Map<string, Date[]>()
  const pushDate = (userId: string | null, at: Date | null) => {
    if (!userId || !at) return
    const list = completionsById.get(userId) ?? []
    list.push(at)
    completionsById.set(userId, list)
  }
  for (const t of recentDone) pushDate(t.assignedToId, t.completedAt)
  for (const t of recentTurns) pushDate(t.userId, t.createdAt)

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    doneCount: (taskCountById.get(u.id) ?? 0) + (turnCountById.get(u.id) ?? 0),
    streak: streakOf(doneDateSet(completionsById.get(u.id) ?? [])),
  }))
}

/** Leaderboard: active users sorted by doneCount desc then streak desc, top 10 */
export async function leaderboardTop10(): Promise<LeaderDTO[]> {
  const all = await activeUserStats()
  return all
    .sort((a, b) => (b.doneCount - a.doneCount) || (b.streak - a.streak))
    .slice(0, 10)
}
