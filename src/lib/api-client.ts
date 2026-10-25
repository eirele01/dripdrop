'use client'

import type {
  DashboardDTO,
  DispenserDTO,
  LeaderDTO,
  MemberDTO,
  MyStatsDTO,
  PaginatedTasks,
  RotationQueueDTO,
  ScheduleDTO,
  SessionUser,
  TaskDTO,
  TaskStatus,
} from '@/lib/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`
    if (res.status === 401) {
      // Session expired — notify listeners so app-root can flip to login
      window.dispatchEvent(new CustomEvent('dd:unauthorized'))
    }
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: SessionUser } | null>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  today: () => request<{ tasks: TaskDTO[]; openTasks: TaskDTO[] }>('/api/tasks?scope=today'),
  history: (params: {
    from?: string
    to?: string
    dispenserId?: string
    status?: TaskStatus | ''
    memberId?: string
    page?: number
    scope?: 'history' | 'all'
  }) => {
    const sp = new URLSearchParams({ scope: params.scope ?? 'history' })
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    if (params.dispenserId) sp.set('dispenserId', params.dispenserId)
    if (params.status) sp.set('status', params.status)
    if (params.memberId) sp.set('memberId', params.memberId)
    sp.set('page', String(params.page ?? 1))
    return request<PaginatedTasks>(`/api/tasks?${sp.toString()}`)
  },
  complete: (taskId: string, form: FormData) =>
    request<{ task: TaskDTO; nextUp: { id: string; name: string } | null; shifted: number }>(
      `/api/tasks/${taskId}/complete`,
      { method: 'POST', body: form }
    ),
  requestRefill: (dispenserId: string) =>
    request<{ task: TaskDTO }>(`/api/dispensers/${dispenserId}/refill-request`, {
      method: 'POST',
    }),
  swap: (taskId: string) =>
    request<{ task: TaskDTO }>(`/api/tasks/${taskId}/swap`, { method: 'POST' }),
  claim: (taskId: string) =>
    request<{ task: TaskDTO }>(`/api/tasks/${taskId}/claim`, { method: 'POST' }),
  myStats: () => request<MyStatsDTO>('/api/stats/me'),
  leaderboard: () => request<{ leaderboard: LeaderDTO[] }>('/api/leaderboard'),
  dispensersAll: () => request<{ dispensers: DispenserDTO[] }>('/api/dispensers'),

  // Live Rotation Queue (standalone, no dates)
  rotation: () => request<{ queues: RotationQueueDTO[] }>('/api/rotation'),
  rotationRefill: (queueId: string, form: FormData) =>
    request<{ turn: { id: string; status: 'DONE' }; queue: RotationQueueDTO }>(
      `/api/rotation/${queueId}/refill`,
      { method: 'POST', body: form }
    ),
  rotationSkip: (queueId: string, note?: string) =>
    request<{ turn: { id: string; status: 'SKIPPED' }; queue: RotationQueueDTO }>(
      `/api/rotation/${queueId}/skip`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { note } : {}),
      }
    ),

  dashboard: () => request<DashboardDTO>('/api/admin/dashboard'),
  members: () => request<{ members: MemberDTO[] }>('/api/admin/members'),
  inviteMember: (body: { name: string; email: string; password: string; role?: string }) =>
    request<{ member: MemberDTO }>('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateMember: (id: string, body: Record<string, unknown>) =>
    request<{ member: MemberDTO }>(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteMember: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/members/${id}`, { method: 'DELETE' }),

  dispensers: () =>
    request<{ dispensers: DispenserDTO[] }>('/api/admin/dispensers'),
  createDispenser: (body: { name: string; location?: string }) =>
    request<{ dispenser: DispenserDTO }>('/api/admin/dispensers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateDispenser: (id: string, body: Record<string, unknown>) =>
    request<{ dispenser: DispenserDTO }>(`/api/admin/dispensers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteDispenser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/dispensers/${id}`, { method: 'DELETE' }),

  schedules: () => request<{ schedules: ScheduleDTO[] }>('/api/admin/schedules'),
  createSchedule: (body: Record<string, unknown>) =>
    request<{ schedule: ScheduleDTO }>('/api/admin/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateSchedule: (id: string, body: Record<string, unknown>) =>
    request<{ schedule: ScheduleDTO }>(`/api/admin/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteSchedule: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/schedules/${id}`, { method: 'DELETE' }),

  updateTask: (id: string, body: Record<string, unknown>) =>
    request<{ task: TaskDTO }>(`/api/admin/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/tasks/${id}`, { method: 'DELETE' }),

  // Live Rotation Queue — admin management
  createRotationQueue: (dispenserId: string) =>
    request<{ queue: RotationQueueDTO }>('/api/admin/rotation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispenserId }),
    }),
  deleteRotationQueue: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/rotation/${id}`, { method: 'DELETE' }),
  addRotationMember: (id: string, userId: string) =>
    request<{ queue: RotationQueueDTO }>(`/api/admin/rotation/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
  removeRotationMember: (id: string, userId: string) =>
    request<{ queue: RotationQueueDTO }>(`/api/admin/rotation/${id}/members/${userId}`, {
      method: 'DELETE',
    }),
  reorderRotation: (id: string, userId: string, direction: 'up' | 'down') =>
    request<{ queue: RotationQueueDTO }>(`/api/admin/rotation/${id}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, direction }),
    }),
  setRotationTurn: (id: string, userId: string | null) =>
    request<{ queue: RotationQueueDTO }>(`/api/admin/rotation/${id}/set-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
}

export function proofUrl(proofPath: string): string {
  return `/api/files/${proofPath}`
}

/** Compress an image file on the client: max 1280px wide, JPEG ~0.72 */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1280 / bitmap.width)
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b && b.size < file.size ? b : file), 'image/jpeg', 0.72)
    )
  } catch {
    return file
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
