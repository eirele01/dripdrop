import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser, requireAdmin, HttpError, errorResponse } from '@/lib/auth'
import { todayStr, shanghaiDayRange, dayStartUtc } from '@/lib/tz'
import { ensureTasksUpToDate } from '@/lib/task-generator'
import { serializeTask } from '@/lib/serialize'

const TASK_INCLUDE = { dispenser: true, assignedTo: true } as const
const PAGE_SIZE = 20
const STATUS_ORDER: Record<string, number> = { PENDING: 0, DONE: 1, MISSED: 2 }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES: readonly string[] = ['PENDING', 'DONE', 'MISSED']

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const scope = sp.get('scope') ?? 'today'

    if (scope === 'today') return await listToday()
    if (scope === 'history') {
      const user = await requireUser()
      return await listHistory(user.id, sp)
    }
    if (scope === 'all') {
      await requireAdmin()
      return await listHistory(null, sp)
    }
    throw new HttpError(400, 'Invalid scope (expected today, history or all)')
  } catch (e) {
    return errorResponse(e)
  }
}

/** scope=today: my tasks due today + the open (unassigned) claimable pool */
async function listToday(): Promise<Response> {
  const user = await requireUser()
  await ensureTasksUpToDate()

  const { start, end } = shanghaiDayRange(todayStr())
  const [tasks, openTasks] = await Promise.all([
    db.refillTask.findMany({
      where: { assignedToId: user.id, dueAt: { gte: start, lt: end } },
      include: TASK_INCLUDE,
    }),
    db.refillTask.findMany({
      where: { status: 'PENDING', assignedToId: null, dueAt: { gte: start } },
      orderBy: { dueAt: 'asc' },
      take: 20,
      include: TASK_INCLUDE,
    }),
  ])

  tasks.sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
    return byStatus !== 0 ? byStatus : a.dueAt.getTime() - b.dueAt.getTime()
  })

  return Response.json({
    tasks: tasks.map(serializeTask),
    openTasks: openTasks.map(serializeTask),
  })
}

/** scope=history (userId set) / scope=all (userId null, admin only) */
async function listHistory(userId: string | null, sp: URLSearchParams): Promise<Response> {
  const from = sp.get('from')
  const to = sp.get('to')
  if (from && !DATE_RE.test(from)) throw new HttpError(400, 'Invalid from date (expected YYYY-MM-DD)')
  if (to && !DATE_RE.test(to)) throw new HttpError(400, 'Invalid to date (expected YYYY-MM-DD)')

  const dispenserId = sp.get('dispenserId') ?? undefined
  const status = sp.get('status')
  if (status && !STATUSES.includes(status)) {
    throw new HttpError(400, 'Invalid status filter (expected PENDING, DONE or MISSED)')
  }
  // Admin list supports a server-side member filter (pagination stays exact).
  const memberId = userId ? undefined : (sp.get('memberId') ?? undefined)

  const pageRaw = Number.parseInt(sp.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

  const where: Prisma.RefillTaskWhereInput = {}
  if (userId) where.assignedToId = userId
  else if (memberId) where.assignedToId = memberId
  const dueAt: Prisma.DateTimeFilter = {}
  if (from) dueAt.gte = dayStartUtc(from)
  if (to) dueAt.lt = new Date(dayStartUtc(to).getTime() + 24 * 3600 * 1000)
  if (from || to) where.dueAt = dueAt
  if (dispenserId) where.dispenserId = dispenserId
  if (status) where.status = status

  // Admin view (scope=all): TODAY'S TASKS FIRST, then everything else newest
  // first. Implemented as two buckets with exact pagination so page slicing
  // stays correct across the boundary.
  if (userId === null) {
    const today = todayStr()
    const { start, end } = shanghaiDayRange(today)

    // Today's window intersected with any from/to filter.
    const fromGte = from ? dayStartUtc(from) : null
    const toLt = to ? new Date(dayStartUtc(to).getTime() + 24 * 3600 * 1000) : null
    const tStart = fromGte && fromGte > start ? fromGte : start
    const tEnd = toLt && toLt < end ? toLt : end

    // tStart/tEnd already account for any from/to filter (intersection), so
    // the today bucket's dueAt range fully replaces the base one.
    const todayWhere: Prisma.RefillTaskWhereInput =
      tStart < tEnd ? { ...where, dueAt: { gte: tStart, lt: tEnd } } : { id: 'none' }
    const otherWhere: Prisma.RefillTaskWhereInput = {
      ...where,
      OR: [{ dueAt: { lt: start } }, { dueAt: { gte: end } }],
    }

    const [todayCount, otherCount] = await Promise.all([
      db.refillTask.count({ where: todayWhere }),
      db.refillTask.count({ where: otherWhere }),
    ])
    const total = todayCount + otherCount
    const skip = (page - 1) * PAGE_SIZE

    const todayTake = Math.max(0, Math.min(PAGE_SIZE, todayCount - skip))
    const otherSkip = Math.max(0, skip - todayCount)
    const otherTake = PAGE_SIZE - todayTake

    const [todayTasks, otherTasks] = await Promise.all([
      todayTake > 0
        ? db.refillTask.findMany({
            where: todayWhere,
            orderBy: { dueAt: 'asc' },
            take: todayTake,
            skip,
            include: TASK_INCLUDE,
          })
        : db.refillTask.findMany({ where: { id: 'none' }, include: TASK_INCLUDE }),
      otherTake > 0
        ? db.refillTask.findMany({
            where: otherWhere,
            orderBy: { dueAt: 'desc' },
            take: otherTake,
            skip: otherSkip,
            include: TASK_INCLUDE,
          })
        : db.refillTask.findMany({ where: { id: 'none' }, include: TASK_INCLUDE }),
    ])

    return Response.json({
      tasks: [...todayTasks, ...otherTasks].map(serializeTask),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    })
  }

  const [total, tasks] = await Promise.all([
    db.refillTask.count({ where }),
    db.refillTask.findMany({
      where,
      orderBy: { dueAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: TASK_INCLUDE,
    }),
  ])

  return Response.json({
    tasks: tasks.map(serializeTask),
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  })
}
