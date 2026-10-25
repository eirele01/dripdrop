// Shared DTO types used by both API routes and client components
export type Role = 'ADMIN' | 'MEMBER'
export type TaskStatus = 'PENDING' | 'DONE' | 'MISSED'
export type WaterLevel = 'FULL' | 'HALF' | 'EMPTY'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface DispenserDTO {
  id: string
  name: string
  location: string | null
  isActive: boolean
}

export interface TaskDTO {
  id: string
  dueAt: string
  status: TaskStatus
  completedAt: string | null
  proofPath: string | null
  waterLevel: WaterLevel | null
  note: string | null
  dispenser: { id: string; name: string; location: string | null }
  assignedTo: { id: string; name: string } | null
  scheduleId: string | null
}

export interface ScheduleDTO {
  id: string
  dispenser: { id: string; name: string }
  recurrence: string
  startDate: string
  endDate: string | null
  dueTime: string
  assignedTo: { id: string; name: string } | null
  rotationMembers: { id: string; name: string }[]
  /** Next person in the rotation (successor of the last completer) */
  nextUp: { id: string; name: string } | null
  isActive: boolean
}

export interface ProofDTO {
  id: string
  proofPath: string
  completedAt: string
  waterLevel: WaterLevel | null
  dispenserName: string
  userName: string
}

export interface LeaderDTO {
  userId: string
  name: string
  doneCount: number
  streak: number
}

export interface DashboardDTO {
  stats: { todayTotal: number; done: number; pending: number; overdue: number; missed: number }
  todayTasks: TaskDTO[]
  overdueTasks: TaskDTO[]
  recentProofs: ProofDTO[]
  leaderboard: LeaderDTO[]
  dispensers: DispenserDTO[]
}

export interface MemberDTO {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  doneCount: number
  openCount: number
}

export interface PaginatedTasks {
  tasks: TaskDTO[]
  page: number
  totalPages: number
  total: number
}

export interface MyStatsDTO {
  doneCount: number
  streak: number
  rank: number
  weekCount: number
}

// ---- Live Rotation Queue (standalone, no date/time) -----------------------
export type RotationTurnStatus = 'DONE' | 'SKIPPED'

export interface RotationMemberDTO {
  userId: string
  name: string
  position: number
  isActive: boolean
  isOnDuty: boolean
  turnsToday: number
  turnsTotal: number
}

export interface RotationTurnDTO {
  id: string
  status: RotationTurnStatus
  userName: string
  proofPath: string | null
  waterLevel: WaterLevel | null
  note: string | null
  createdAt: string
}

export interface RotationQueueDTO {
  id: string
  dispenser: { id: string; name: string; location: string | null; isActive: boolean }
  members: RotationMemberDTO[]
  onDuty: { userId: string; name: string } | null
  isMyTurn: boolean
  nextUp: { userId: string; name: string } | null
  todayTurns: number
  totalTurns: number
  recentTurns: RotationTurnDTO[]
}
