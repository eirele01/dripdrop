import { db } from '@/lib/db'
import { requireAdmin, errorResponse } from '@/lib/auth'
import { todayStr, shanghaiDayRange } from '@/lib/tz'
import { ensureTasksUpToDate } from '@/lib/task-generator'
import { serializeTask, serializeDispenser, serializeProof } from '@/lib/serialize'
import { leaderboardTop10 } from '@/lib/leaderboard'
import type { TaskStatus } from '@/lib/types'

const TASK_INCLUDE = { dispenser: true, assignedTo: true } as const
const STATUS_ORDER: Record<string, number> = { PENDING: 0, DONE: 1, MISSED: 2 }

export async function GET() {
  try {
    await requireAdmin()
    await ensureTasksUpToDate()

    const { start, end } = shanghaiDayRange(todayStr())
    const now = new Date()

    // Stats: per-status counts within today + overdue across all days
    const [statusGroups, overdue, todayTasks, overdueTasks, recentProofs, dispensers, leaderboard] =
      await Promise.all([
        db.refillTask.groupBy({
          by: ['status'],
          where: { dueAt: { gte: start, lt: end } },
          _count: { _all: true },
        }),
        db.refillTask.count({ where: { status: 'PENDING', dueAt: { lt: now } } }),
        db.refillTask.findMany({
          where: { dueAt: { gte: start, lt: end } },
          include: TASK_INCLUDE,
        }),
        db.refillTask.findMany({
          where: { status: 'PENDING', dueAt: { lt: now } },
          orderBy: { dueAt: 'asc' },
          take: 20,
          include: TASK_INCLUDE,
        }),
        db.refillTask.findMany({
          where: { proofPath: { not: null }, completedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            proofPath: true,
            completedAt: true,
            waterLevel: true,
            dispenser: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        }),
        db.dispenser.findMany({ orderBy: { name: 'asc' } }),
        leaderboardTop10(),
      ])

    const countByStatus = new Map<TaskStatus, number>()
    for (const g of statusGroups) countByStatus.set(g.status as TaskStatus, g._count._all)
    const done = countByStatus.get('DONE') ?? 0
    const pending = countByStatus.get('PENDING') ?? 0
    const missed = countByStatus.get('MISSED') ?? 0

    todayTasks.sort((a, b) => {
      const byStatus = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      return byStatus !== 0 ? byStatus : a.dueAt.getTime() - b.dueAt.getTime()
    })

    return Response.json({
      stats: {
        todayTotal: done + pending + missed,
        done,
        pending,
        missed,
        overdue,
      },
      todayTasks: todayTasks.map(serializeTask),
      overdueTasks: overdueTasks.map(serializeTask),
      recentProofs: recentProofs.map((p) =>
        serializeProof({
          id: p.id,
          proofPath: p.proofPath as string,
          completedAt: p.completedAt as Date,
          waterLevel: p.waterLevel,
          dispenserName: p.dispenser.name,
          userName: p.assignedTo?.name ?? null,
        })
      ),
      leaderboard,
      dispensers: dispensers.map(serializeDispenser),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
