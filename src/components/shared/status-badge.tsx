'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import type { TaskStatus, WaterLevel } from '@/lib/types'

const STATUS_MAP: Record<TaskStatus, { label: string; cls: string; icon: typeof CircleDashed }> = {
  PENDING: {
    label: 'Pending',
    cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    icon: CircleDashed,
  },
  DONE: {
    label: 'Done',
    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
    icon: CheckCircle2,
  },
  MISSED: {
    label: 'Missed',
    cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
    icon: XCircle,
  },
}

export function StatusBadge({ status, className = '' }: { status: TaskStatus; className?: string }) {
  const s = STATUS_MAP[status]
  const Icon = s.icon
  return (
    <Badge variant="outline" className={`gap-1 rounded-full font-medium ${s.cls} ${className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </Badge>
  )
}

const LEVEL_MAP: Record<WaterLevel, { label: string; cls: string }> = {
  FULL: {
    label: 'Was full',
    cls: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900',
  },
  HALF: {
    label: 'Was half',
    cls: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-900',
  },
  EMPTY: {
    label: 'Was empty',
    cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
  },
}

export function WaterLevelBadge({ level }: { level: WaterLevel }) {
  const l = LEVEL_MAP[level]
  return (
    <Badge variant="outline" className={`rounded-full font-medium ${l.cls}`}>
      💧 {l.label}
    </Badge>
  )
}

export function UserAvatar({ name, className = '' }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ${className}`}
    >
      {initials || '?'}
    </div>
  )
}
