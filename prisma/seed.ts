// Seed script — run with: bun prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'
import { todayStr, addDays, combineToUtc, weekdayOf } from '../src/lib/tz'

const db = new PrismaClient()

async function main() {
  console.log('Seeding DripDrop…')

  const password = hashPassword('member123')
  const adminPassword = hashPassword('admin123')

  const admin = await db.user.upsert({
    where: { email: 'admin@dripdrop.app' },
    update: { passwordHash: adminPassword, isActive: true },
    create: { email: 'admin@dripdrop.app', name: 'Sam Admin', passwordHash: adminPassword, role: 'ADMIN' },
  })
  const mia = await db.user.upsert({
    where: { email: 'mia@dripdrop.app' },
    update: { isActive: true },
    create: { email: 'mia@dripdrop.app', name: 'Mia Cruz', passwordHash: password, role: 'MEMBER' },
  })
  const leo = await db.user.upsert({
    where: { email: 'leo@dripdrop.app' },
    update: { isActive: true },
    create: { email: 'leo@dripdrop.app', name: 'Leo Reyes', passwordHash: password, role: 'MEMBER' },
  })
  const ava = await db.user.upsert({
    where: { email: 'ava@dripdrop.app' },
    update: { isActive: true },
    create: { email: 'ava@dripdrop.app', name: 'Ava Lim', passwordHash: password, role: 'MEMBER' },
  })

  const kitchen =
    (await db.dispenser.findFirst({ where: { name: 'Kitchen Corner' } })) ??
    (await db.dispenser.create({
      data: { name: 'Kitchen Corner', location: '3F pantry, beside the sink' },
    }))
  const pantry =
    (await db.dispenser.findFirst({ where: { name: 'Pantry Plus' } })) ??
    (await db.dispenser.create({
      data: { name: 'Pantry Plus', location: '5F breakout area' },
    }))
  const lobby =
    (await db.dispenser.findFirst({ where: { name: 'Lobby Cooler' } })) ??
    (await db.dispenser.create({
      data: { name: 'Lobby Cooler', location: 'Ground floor reception' },
    }))

  // Rotation schedule started 7 days ago: Mia → Leo → Ava, every day at 09:00
  const rotationStart = new Date(`${addDays(todayStr(), -7)}T00:00:00+08:00`)
  const rotation = await db.schedule.findFirst({ where: { dispenserId: kitchen.id, recurrence: 'DAILY' } })
  if (!rotation) {
    await db.schedule.create({
      data: {
        dispenserId: kitchen.id,
        recurrence: 'DAILY',
        startDate: rotationStart,
        dueTime: '09:00',
        rotationMembers: JSON.stringify([mia.id, leo.id, ava.id]),
        createdById: admin.id,
      },
    })
  }
  const weekly = await db.schedule.findFirst({ where: { dispenserId: pantry.id } })
  if (!weekly) {
    await db.schedule.create({
      data: {
        dispenserId: pantry.id,
        recurrence: 'WEEKLY:MON,THU',
        startDate: new Date(`${addDays(todayStr(), -10)}T00:00:00+08:00`),
        dueTime: '14:00',
        assignedToId: leo.id,
        createdById: admin.id,
      },
    })
  }

  // Past history: 6 days of DONE refills on Kitchen, proof photos included
  const proofs = ['seed/proof-1.jpg', 'seed/proof-2.jpg', 'seed/proof-3.jpg']
  const levels = ['HALF', 'EMPTY', 'FULL', 'HALF', 'EMPTY', 'HALF']
  const crew = [mia, leo, ava]
  const existingHistory = await db.refillTask.count({ where: { scheduleId: null, status: 'DONE' } })
  if (existingHistory === 0) {
    for (let i = 6; i >= 1; i--) {
      const dateStr = addDays(todayStr(), -i)
      const person = crew[(6 - i) % 3]
      const dueAt = combineToUtc(dateStr, '09:00')
      await db.refillTask.create({
        data: {
          dispenserId: kitchen.id,
          assignedToId: person.id,
          dueAt,
          status: 'DONE',
          completedAt: new Date(dueAt.getTime() + (20 + ((i * 13) % 40)) * 60000),
          proofPath: proofs[(6 - i) % 3],
          waterLevel: levels[(6 - i) % 6],
          note: i === 2 ? 'Replaced the empty bottle with the new one from storage.' : null,
        },
      })
    }
    // One weekly task last Monday, done by Leo
    let lastMonday = todayStr()
    while (weekdayOf(lastMonday) !== 'MON') lastMonday = addDays(lastMonday, -1)
    if (lastMonday < todayStr()) {
      await db.refillTask.create({
        data: {
          dispenserId: pantry.id,
          assignedToId: leo.id,
          dueAt: combineToUtc(lastMonday, '14:00'),
          status: 'DONE',
          completedAt: combineToUtc(lastMonday, '14:22'),
          proofPath: 'seed/proof-3.jpg',
          waterLevel: 'EMPTY',
        },
      })
    }
    // One MISSED task 2 days ago by Ava
    await db.refillTask.create({
      data: {
        dispenserId: lobby.id,
        assignedToId: ava.id,
        dueAt: combineToUtc(addDays(todayStr(), -2), '17:00'),
        status: 'MISSED',
      },
    })
  }

  // ---- Live Rotation Queue demo (standalone, no dates) --------------------
  // Kitchen Corner: Mia(0) → Leo(1) → Ava(2). Three turns already logged
  // today, so it's Mia's turn again — and refills can happen unlimited
  // times per day; each one instantly advances the turn.
  const kitchenQueue = await db.rotationQueue.findFirst({ where: { dispenserId: kitchen.id } })
  if (!kitchenQueue) {
    const queue = await db.rotationQueue.create({
      data: { dispenserId: kitchen.id, currentUserId: null },
    })
    const queueCrew = [
      { userId: mia.id, position: 0 },
      { userId: leo.id, position: 1 },
      { userId: ava.id, position: 2 },
    ]
    await db.rotationMember.createMany({ data: queueCrew.map((m) => ({ ...m, queueId: queue.id })) })
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000)
    await db.rotationTurn.createMany({
      data: [
        { queueId: queue.id, userId: mia.id, status: 'DONE', proofPath: 'seed/proof-1.jpg', waterLevel: 'EMPTY', createdAt: hoursAgo(5) },
        { queueId: queue.id, userId: leo.id, status: 'DONE', proofPath: 'seed/proof-2.jpg', waterLevel: 'EMPTY', note: 'Second refill today — bottle ran out after lunch.', createdAt: hoursAgo(3) },
        { queueId: queue.id, userId: ava.id, status: 'DONE', proofPath: 'seed/proof-3.jpg', waterLevel: 'HALF', createdAt: hoursAgo(1) },
      ],
    })
    // After Ava the next active member is Mia.
    await db.rotationQueue.update({ where: { id: queue.id }, data: { currentUserId: mia.id } })
  }

  // Every other dispenser also gets a queue automatically (person-chain is the
  // default everywhere) — seeded with the active members, pointer = first.
  for (const d of [pantry, lobby]) {
    const existing = await db.rotationQueue.findUnique({ where: { dispenserId: d.id } })
    if (!existing) {
      const queue = await db.rotationQueue.create({ data: { dispenserId: d.id } })
      const crewIds = [mia.id, leo.id, ava.id]
      await db.rotationMember.createMany({
        data: crewIds.map((userId, position) => ({ queueId: queue.id, userId, position })),
      })
    }
  }

  const counts = {
    users: await db.user.count(),
    dispensers: await db.dispenser.count(),
    schedules: await db.schedule.count(),
    tasks: await db.refillTask.count(),
    rotationQueues: await db.rotationQueue.count(),
    rotationTurns: await db.rotationTurn.count(),
  }
  console.log('Seed complete:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
