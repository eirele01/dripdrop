import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'
import { addDays, dayStartUtc, todayStr } from '@/lib/tz'
import { activeUserStats } from '@/lib/leaderboard'

export async function GET() {
  try {
    const user = await requireUser()
    const stats = await activeUserStats()
    const mine = stats.find((s) => s.userId === user.id)
    const doneCount = mine?.doneCount ?? 0

    // Rank = 1 + number of active users with strictly more refills
    const rank = 1 + stats.filter((s) => s.doneCount > doneCount).length

    // Week count = refills completed in the last 7 days (today-6 .. today),
    // across BOTH paths: scheduled tasks + standalone live-rotation turns.
    const weekStart = dayStartUtc(addDays(todayStr(), -6))
    const [taskWeek, turnWeek] = await Promise.all([
      db.refillTask.count({
        where: { assignedToId: user.id, status: 'DONE', completedAt: { gte: weekStart } },
      }),
      db.rotationTurn.count({
        where: { userId: user.id, status: 'DONE', taskId: null, createdAt: { gte: weekStart } },
      }),
    ])

    return Response.json({
      doneCount,
      streak: mine?.streak ?? 0,
      rank,
      weekCount: taskWeek + turnWeek,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
