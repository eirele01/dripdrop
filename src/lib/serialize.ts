// Shared serializers: Prisma rows -> API DTOs (contract in agent-ctx/api-contract.md)
import type { Dispenser, RefillTask, Schedule, User } from '@prisma/client'
import { dateStrOf } from '@/lib/tz'
import type {
  DispenserDTO,
  MemberDTO,
  ProofDTO,
  Role,
  ScheduleDTO,
  TaskDTO,
  TaskStatus,
  WaterLevel,
} from '@/lib/types'

export type TaskWithRelations = RefillTask & {
  dispenser: Dispenser
  assignedTo: User | null
}

export type ScheduleWithRelations = Schedule & {
  dispenser: Dispenser
  assignedTo: User | null
}

export interface RotationMember {
  id: string
  name: string
}

export function serializeTask(t: TaskWithRelations): TaskDTO {
  return {
    id: t.id,
    dueAt: t.dueAt.toISOString(),
    status: t.status as TaskStatus,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    proofPath: t.proofPath,
    waterLevel: (t.waterLevel as WaterLevel | null) ?? null,
    note: t.note,
    dispenser: {
      id: t.dispenser.id,
      name: t.dispenser.name,
      location: t.dispenser.location,
    },
    assignedTo: t.assignedTo ? { id: t.assignedTo.id, name: t.assignedTo.name } : null,
    scheduleId: t.scheduleId,
  }
}

export function serializeDispenser(d: Dispenser): DispenserDTO {
  return {
    id: d.id,
    name: d.name,
    location: d.location,
    isActive: d.isActive,
  }
}

export function serializeSchedule(
  s: ScheduleWithRelations,
  rotationMembers: RotationMember[],
  nextUp: { id: string; name: string } | null = null
): ScheduleDTO {
  return {
    id: s.id,
    dispenser: { id: s.dispenser.id, name: s.dispenser.name },
    recurrence: s.recurrence,
    startDate: dateStrOf(s.startDate),
    endDate: s.endDate ? dateStrOf(s.endDate) : null,
    dueTime: s.dueTime,
    assignedTo: s.assignedTo ? { id: s.assignedTo.id, name: s.assignedTo.name } : null,
    rotationMembers,
    nextUp,
    isActive: s.isActive,
  }
}

export interface MemberRow {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  doneCount: number
  openCount: number
}

export function serializeMember(m: MemberRow): MemberDTO {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role as Role,
    isActive: m.isActive,
    doneCount: m.doneCount,
    openCount: m.openCount,
  }
}

export interface ProofRow {
  id: string
  proofPath: string
  completedAt: Date | string
  waterLevel: string | null
  dispenserName: string
  userName: string | null
}

export function serializeProof(p: ProofRow): ProofDTO {
  return {
    id: p.id,
    proofPath: p.proofPath,
    completedAt:
      typeof p.completedAt === 'string' ? p.completedAt : p.completedAt.toISOString(),
    waterLevel: (p.waterLevel as WaterLevel | null) ?? null,
    dispenserName: p.dispenserName,
    userName: p.userName ?? 'Former member',
  }
}
