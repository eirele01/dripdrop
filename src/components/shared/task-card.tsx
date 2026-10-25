'use client'

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge, UserAvatar, WaterLevelBadge } from '@/components/shared/status-badge'
import { MapPin, Clock, AlertTriangle, Droplets } from 'lucide-react'
import { formatDateTime } from '@/lib/tz'
import type { TaskDTO } from '@/lib/types'

export function TaskCard({
  task,
  showAssignee = false,
  isMine = false,
  onRefill,
  onSwap,
  onOpenProof,
  footer,
}: {
  task: TaskDTO
  showAssignee?: boolean
  isMine?: boolean
  onRefill?: (task: TaskDTO) => void
  onSwap?: (task: TaskDTO) => void
  onOpenProof?: (task: TaskDTO) => void
  /** Extra actions rendered inside the card (admin tools) */
  footer?: ReactNode
}) {
  const overdue = task.status === 'PENDING' && new Date(task.dueAt) < new Date()
  const timeStr = formatDateTime(task.dueAt)

  return (
    <Card className={`rounded-2xl border shadow-sm ${overdue ? 'border-red-200 dark:border-red-900' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-950 dark:to-sky-950"
            >
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{task.dispenser.name}</p>
              {task.dispenser.location && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{task.dispenser.location}</span>
                </p>
              )}
            </div>
          </div>
          <StatusBadge status={task.status} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span
            className={`inline-flex items-center gap-1 ${
              overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'
            }`}
          >
            {overdue ? (
              <AlertTriangle className="h-3 w-3" aria-hidden />
            ) : (
              <Clock className="h-3 w-3" aria-hidden />
            )}
            {overdue ? `Overdue · was due ${timeStr}` : `Due ${timeStr}`}
          </span>
          {showAssignee && task.assignedTo && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <UserAvatar name={task.assignedTo.name} className="h-5 w-5 text-[9px]" />
              {task.assignedTo.name}
            </span>
          )}
          {!task.assignedTo && task.status === 'PENDING' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              🙌 Unassigned — claimable
            </span>
          )}
        </div>

        {task.status === 'DONE' && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-50 p-2.5 dark:bg-emerald-950/40">
            {task.proofPath && onOpenProof ? (
              <button
                type="button"
                onClick={() => onOpenProof(task)}
                className="shrink-0 overflow-hidden rounded-lg border ring-primary/30 transition hover:ring-2"
                aria-label="View refill proof photo"
              >
                { }
                <img
                  src={`/api/files/${task.proofPath}`}
                  alt="Refill proof thumbnail"
                  className="h-14 w-14 object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xl dark:bg-emerald-900" aria-hidden>
                ✅
              </div>
            )}
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                Completed {task.completedAt ? formatDateTime(task.completedAt) : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {task.waterLevel && <WaterLevelBadge level={task.waterLevel} />}
              </div>
              {task.note && <p className="mt-1 truncate italic text-muted-foreground">“{task.note}”</p>}
            </div>
          </div>
        )}

        {task.status === 'PENDING' && isMine && onRefill && (
          <Button
            type="button"
            size="lg"
            className={`mt-3 h-12 w-full rounded-xl text-base font-bold shadow-md shadow-primary/20 ${
              overdue ? 'bg-amber-500 hover:bg-amber-600' : ''
            }`}
            onClick={() => onRefill(task)}
          >
            💧 Mark as Refilled
          </Button>
        )}

        {task.status === 'PENDING' && isMine && onSwap && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1.5 h-8 w-full text-xs text-muted-foreground"
            onClick={() => onSwap(task)}
          >
            Can&apos;t make it? Release this shift
          </Button>
        )}

        {footer && <div className="mt-3 border-t pt-3">{footer}</div>}
      </CardContent>
    </Card>
  )
}
