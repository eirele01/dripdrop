'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { TaskCard } from '@/components/shared/task-card'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { LeaderboardCard } from '@/components/shared/leaderboard-card'
import { EmptyState } from '@/components/shared/empty-state'
import { UserAvatar } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Camera, Repeat } from 'lucide-react'
import type { RotationQueueDTO, SessionUser, TaskDTO } from '@/lib/types'

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Shanghai',
})

export function DashboardScreen({ user }: { user: SessionUser }) {
  const [proof, setProof] = useState<ProofInfo | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    refetchInterval: 10_000,
  })

  // Live rotation queues (person-chain) — same cache as the Rotation console.
  const { data: rotationData } = useQuery({
    queryKey: ['rotation'],
    queryFn: api.rotation,
    refetchInterval: 8_000,
  })
  const queues = (rotationData?.queues ?? []).filter((q) => q.dispenser.isActive)

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const { stats } = data

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{DATE_FMT.format(new Date())}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Team dashboard</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Today's stats">
        <StatCard emoji="🚰" value={stats.todayTotal} label="Tasks today" tone="default" />
        <StatCard emoji="✅" value={stats.done} label="Done" tone="good" />
        <StatCard emoji="⏳" value={stats.pending} label="Pending" tone="warn" />
        <StatCard
          emoji="🚨"
          value={stats.overdue}
          label={stats.missed > 0 ? `Overdue · ${stats.missed} missed` : 'Overdue'}
          tone={stats.overdue > 0 || stats.missed > 0 ? 'bad' : 'good'}
        />
      </div>

      {data.overdueTasks.length > 0 && (
        <Card className="rounded-2xl border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" /> Needs attention
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pending tasks past their due time — nudge the member or reassign in Tasks.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueTasks.slice(0, 5).map((t) => (
              <OverdueRow key={t.id} task={t} />
            ))}
            {data.overdueTasks.length > 5 && (
              <p className="pt-1 text-xs text-muted-foreground">
                + {data.overdueTasks.length - 5} more in the Tasks tab
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-label="Live rotation">
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-muted-foreground">
          <Repeat className="h-4 w-4 text-primary" aria-hidden /> Live rotation — who&apos;s on duty
        </h2>
        {queues.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No rotation queues yet — they are created automatically for every dispenser.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queues.map((q) => (
              <RotationMiniCard key={q.id} queue={q} meId={user.id} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Today's roster">
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          Today&apos;s roster ({data.todayTasks.length})
        </h2>
        {data.todayTasks.length === 0 ? (
          <EmptyState emoji="🫗" title="No tasks scheduled today" subtitle="Create a schedule to get the water flowing." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.todayTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                showAssignee
                onOpenProof={(task) =>
                  task.proofPath &&
                  setProof({
                    url: `/api/files/${task.proofPath}`,
                    userName: task.assignedTo?.name,
                    dispenserName: task.dispenser.name,
                    completedAt: task.completedAt,
                    waterLevel: task.waterLevel,
                    note: task.note,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Proof gallery">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-5 w-5 text-primary" /> Latest proof photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentProofs.length === 0 ? (
              <EmptyState emoji="📸" title="No proofs yet" subtitle="Photos appear as members submit refills." compact />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {data.recentProofs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setProof({
                        url: `/api/files/${p.proofPath}`,
                        userName: p.userName,
                        dispenserName: p.dispenserName,
                        completedAt: p.completedAt,
                        waterLevel: p.waterLevel,
                      })
                    }
                    className="group relative aspect-square overflow-hidden rounded-xl border transition hover:ring-2 hover:ring-primary/50"
                    aria-label={`Proof by ${p.userName} for ${p.dispenserName}`}
                  >
                    { }
                    <img
                      src={`/api/files/${p.proofPath}`}
                      alt={`Refill proof by ${p.userName}`}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                      {p.userName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <LeaderboardCard entries={data.leaderboard} highlightUserId={user.id} />

      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}

function StatCard({
  emoji,
  value,
  label,
  tone,
}: {
  emoji: string
  value: number
  label: string
  tone: 'default' | 'good' | 'warn' | 'bad'
}) {
  const tones = {
    default: 'border-border',
    good: 'border-emerald-200 dark:border-emerald-900',
    warn: 'border-amber-200 dark:border-amber-900',
    bad: 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30',
  }
  return (
    <Card className={`rounded-2xl ${tones[tone]}`}>
      <CardContent className="p-4">
        <p className="text-xl" aria-hidden>
          {emoji}
        </p>
        <p className="mt-1 text-3xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

function OverdueRow({ task }: { task: TaskDTO }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {task.assignedTo?.name ?? 'Unassigned'} · {task.dispenser.name}
        </p>
        <p className="text-xs text-red-500">
          Was due {new Date(task.dueAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })}
        </p>
      </div>
      <span className="text-lg" aria-hidden>
        ⏰
      </span>
    </div>
  )
}

/** Compact live-rotation card for the dashboard: who's on duty + who's next. */
function RotationMiniCard({ queue, meId }: { queue: RotationQueueDTO; meId: string }) {
  const { onDuty, nextUp, isMyTurn } = queue
  return (
    <Card
      className={`rounded-2xl ${isMyTurn ? 'border-primary/50 shadow-md shadow-primary/10' : ''}`}
    >
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
            <span aria-hidden>🫙</span>
            <span className="truncate">{queue.dispenser.name}</span>
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {queue.todayTurns} today
          </span>
        </div>
        {onDuty ? (
          <div className="flex items-center gap-2.5">
            <UserAvatar name={onDuty.name} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isMyTurn ? "It's your turn" : 'On duty now'}
              </p>
              <p className={`truncate text-sm font-bold ${isMyTurn ? 'text-primary' : ''}`}>
                {onDuty.name}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody on duty — add active members</p>
        )}
        {nextUp && onDuty && (
          <p className="truncate text-xs text-muted-foreground">
            Next up: <span className="font-semibold text-foreground">{nextUp.name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
