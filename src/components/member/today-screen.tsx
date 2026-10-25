'use client'

// Member "Today" screen — ROTATION-FIRST.
// The live rotation queue (person-chain, no dates) is the primary surface:
// whoever the chain points to refills and logs it, the turn advances instantly,
// and the same dispenser can be refilled many times a day.
// Date-based scheduled refills stay below as an optional extra.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { TaskCard } from '@/components/shared/task-card'
import { RefillDrawer } from '@/components/shared/refill-drawer'
import { RotationDrawer } from '@/components/shared/rotation-drawer'
import { SkipTurnDialog } from '@/components/shared/skip-turn-dialog'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { UserAvatar } from '@/components/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CupSoda, HandHeart, Loader2, MapPin, Repeat, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { todayStr } from '@/lib/tz'
import type {
  RotationQueueDTO,
  SessionUser,
  TaskDTO,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Shanghai',
})

export function TodayScreen({
  user,
  pendingRefillId,
  onOpenRotation,
}: {
  user: SessionUser
  pendingRefillId: string | null
  onOpenRotation?: () => void
}) {
  const qc = useQueryClient()
  const [refillTask, setRefillTask] = useState<TaskDTO | null>(null)
  const [drawerQueue, setDrawerQueue] = useState<RotationQueueDTO | null>(null)
  const [skipQueue, setSkipQueue] = useState<RotationQueueDTO | null>(null)
  const [proof, setProof] = useState<ProofInfo | null>(null)
  const [pickedDispenser, setPickedDispenser] = useState('')
  const autoOpened = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['today'],
    queryFn: api.today,
    refetchInterval: 15_000,
  })

  const { data: dispensersData } = useQuery({
    queryKey: ['dispensers'],
    queryFn: api.dispensersAll,
  })

  // The live rotation person-chain — same cache as the Rotation tab (8s polling).
  const { data: rotationData, isLoading: rotationLoading } = useQuery({
    queryKey: ['rotation'],
    queryFn: api.rotation,
    refetchInterval: 8_000,
  })

  function applyQueue(fresh: RotationQueueDTO) {
    qc.setQueryData<{ queues: RotationQueueDTO[] }>(['rotation'], (old) =>
      old ? { queues: old.queues.map((q) => (q.id === fresh.id ? fresh : q)) } : old
    )
  }

  const requestRefill = useMutation({
    mutationFn: (dispenserId: string) => api.requestRefill(dispenserId),
    onSuccess: ({ task }) => {
      const who = task.assignedTo?.name ?? 'a teammate'
      toast.success(`Notified ${who} — the dispenser is on them 💪`, {
        description: `One-off task created for ${task.dispenser.name} — next in line gets it.`,
      })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['myStats'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Request failed'),
  })

  // QR entry: auto-open the right flow for the scanned dispenser.
  // 1) a pending scheduled task for it → refill drawer
  // 2) a live rotation queue → if it's your turn, open the rotation drawer,
  //    otherwise tell the user whose turn it is (the chain handles it).
  useEffect(() => {
    if (!pendingRefillId || autoOpened.current) return
    if (isLoading || rotationLoading) return
    if (!data || !rotationData) return
    autoOpened.current = true

    const match =
      data.tasks.find((t) => t.dispenser.id === pendingRefillId && t.status === 'PENDING') ??
      data.openTasks.find((t) => t.dispenser.id === pendingRefillId)
    if (match) {
      if (match.assignedTo && match.assignedTo.id !== user.id) {
        toast.info(`You scanned ${match.dispenser.name} — it's ${match.assignedTo.name}'s shift today`)
        return
      }
      const timer = setTimeout(() => setRefillTask(match), 50)
      return () => clearTimeout(timer)
    }

    const queue = rotationData.queues.find((q) => q.dispenser.id === pendingRefillId)
    if (queue && queue.dispenser.isActive) {
      if (queue.isMyTurn) {
        const timer = setTimeout(() => setDrawerQueue(queue), 50)
        return () => clearTimeout(timer)
      }
      if (queue.onDuty) {
        toast.info(`🫙 ${queue.dispenser.name} — it's ${queue.onDuty.name}'s turn right now`, {
          description:
            'Live rotation: no times, the chain moves when they log the refill. Empty again later? Log it again.',
        })
        return
      }
    }

    toast.info('No open refill for that dispenser right now 💧', {
      description: 'Flag it as empty — the next person in line gets notified.',
      action: {
        label: 'Request refill',
        onClick: () => requestRefill.mutate(pendingRefillId),
      },
      duration: 10_000,
    })
  }, [data, rotationData, isLoading, rotationLoading, pendingRefillId, user.id, requestRefill])

  const swap = useMutation({
    mutationFn: (taskId: string) => api.swap(taskId),
    onSuccess: () => {
      toast.success('Shift released — anyone can claim it now 🙌')
      qc.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Swap failed'),
  })

  const claim = useMutation({
    mutationFn: (taskId: string) => api.claim(taskId),
    onSuccess: () => {
      toast.success('Task claimed — it\'s yours now 💪')
      qc.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Claim failed'),
  })

  function onSubmitted() {
    qc.invalidateQueries({ queryKey: ['today'] })
    qc.invalidateQueries({ queryKey: ['myStats'] })
  }

  const tasks = data?.tasks ?? []
  const openTasks = data?.openTasks ?? []
  const pending = tasks.filter((t) => t.status === 'PENDING')
  const finished = tasks.filter((t) => t.status !== 'PENDING')
  const queues = (rotationData?.queues ?? []).filter((q) => q.dispenser.isActive)
  const myTurnQueues = queues.filter((q) => q.isMyTurn)
  const otherQueues = queues.filter((q) => !q.isMyTurn && q.onDuty)

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{DATE_FMT.format(new Date())}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hi {user.name.split(' ')[0]} 👋
          </h1>
        </div>
      </header>

      {rotationLoading && queues.length === 0 ? (
        <Skeleton className="h-44 w-full rounded-2xl" />
      ) : (
        queues.length > 0 && (
          <section aria-label="Live rotation — whose turn it is">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Repeat className="h-4 w-4 text-primary" aria-hidden /> Live rotation
              </h2>
              {onOpenRotation && (
                <button
                  type="button"
                  onClick={onOpenRotation}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View queue →
                </button>
              )}
            </div>
            <div className="space-y-3">
              {[...myTurnQueues, ...otherQueues].map((q) => (
                <RotationHeroCard
                  key={q.id}
                  queue={q}
                  user={user}
                  onRefill={() => setDrawerQueue(q)}
                  onSkip={() => setSkipQueue(q)}
                />
              ))}
            </div>
          </section>
        )
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <section aria-label="My scheduled refills today">
            {tasks.length === 0 ? (
              <EmptyState
                emoji="🎉"
                title="Nothing scheduled for you today"
                subtitle={
                  queues.length > 0
                    ? 'No timed refills — just follow the live rotation above.'
                    : 'Enjoy the free day — or check open shifts below to help out.'
                }
              />
            ) : (
              <>
                {pending.length > 0 && (
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Scheduled refills
                  </p>
                )}
                <div className="space-y-3">
                  {pending.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      isMine={t.assignedTo?.id === user.id}
                      onRefill={(task) => setRefillTask(task)}
                      onSwap={(task) => {
                        if (confirm('Release this shift so a teammate can claim it?')) swap.mutate(task.id)
                      }}
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
              </>
            )}
          </section>

          {openTasks.length > 0 && (
            <section aria-label="Open shifts">
              <Card className="rounded-2xl border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HandHeart className="h-5 w-5 text-primary" /> Open shifts
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Teammates released these — claim one to be a hero
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {openTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.dispenser.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatTime(t.dueAt)}
                          {t.dueAt.slice(0, 10) !== todayStr() ? ' · upcoming' : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="h-9 rounded-lg px-4 font-semibold"
                        disabled={claim.isPending}
                        onClick={() => claim.mutate(t.id)}
                      >
                        {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {(() => {
            const dispensers = (dispensersData?.dispensers ?? []).filter((d) => d.isActive)
            if (dispensers.length === 0) return null
            const selected = pickedDispenser || dispensers[0].id
            return (
              <section aria-label="Request a refill">
                <Card className="rounded-2xl border-dashed border-primary/40 bg-primary/5">
                  <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CupSoda className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      Dispenser empty?
                    </div>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <Select value={selected} onValueChange={setPickedDispenser}>
                        <SelectTrigger
                          aria-label="Which dispenser is empty"
                          className="h-10 flex-1 rounded-xl bg-card"
                        >
                          <SelectValue placeholder="Which dispenser?" />
                        </SelectTrigger>
                        <SelectContent>
                          {dispensers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                              {d.location ? ` — ${d.location}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="h-10 shrink-0 rounded-xl px-4 font-semibold"
                        disabled={requestRefill.isPending}
                        onClick={() => requestRefill.mutate(selected)}
                      >
                        {requestRefill.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Notify them'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                  Creates a one-off task for the next person in that dispenser&apos;s rotation.
                </p>
              </section>
            )
          })()}

          {finished.length > 0 && (
            <section aria-label="Completed today">
              <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
                Earlier today
              </h2>
              <div className="space-y-3">
                {finished.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isMine={t.assignedTo?.id === user.id}
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
            </section>
          )}

          {tasks.length > 0 && pending.length === 0 && (
            <EmptyState emoji="💦" title="All refilled!" subtitle="Everything on your list is done. Stay hydrated ✨" compact />
          )}
        </>
      )}

      <RefillDrawer
        task={refillTask}
        onOpenChange={(open) => !open && setRefillTask(null)}
        onSubmitted={onSubmitted}
      />
      <RotationDrawer queue={drawerQueue} onOpenChange={(o) => !o && setDrawerQueue(null)} onLogged={applyQueue} />
      <SkipTurnDialog queue={skipQueue} onClose={() => setSkipQueue(null)} onSkipped={applyQueue} />
      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}

/**
 * Compact rotation card for the Today screen. When it's the viewer's turn it
 * becomes the primary CTA; otherwise it shows who is on duty and who's next.
 */
function RotationHeroCard({
  queue,
  user,
  onRefill,
  onSkip,
}: {
  queue: RotationQueueDTO
  user: SessionUser
  onRefill: () => void
  onSkip: () => void
}) {
  const { onDuty, nextUp, isMyTurn } = queue

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl',
        isMyTurn && 'border-primary/50 shadow-md shadow-primary/10'
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold leading-tight">
              <span aria-hidden>🫙</span>
              <span className="truncate">{queue.dispenser.name}</span>
            </p>
            {queue.dispenser.location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden /> {queue.dispenser.location}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {queue.todayTurns} refill{queue.todayTurns === 1 ? '' : 's'} today
          </span>
        </div>

        {isMyTurn && onDuty ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3.5">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              It&apos;s your turn 🫵
            </p>
            <p className="mt-1 text-sm text-foreground">
              Refill it whenever it empties — log each time, the next person takes over instantly.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Button
                size="lg"
                className="h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
                onClick={onRefill}
              >
                💧 I refilled it
              </Button>
              <Button size="lg" variant="outline" className="h-11 rounded-2xl" onClick={onSkip}>
                <SkipForward className="h-4 w-4" aria-hidden /> Skip my turn
              </Button>
            </div>
          </div>
        ) : onDuty ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3">
            <UserAvatar name={onDuty.name} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                On duty now
              </p>
              <p className="truncate text-sm font-bold">{onDuty.name}</p>
              {nextUp && (
                <p className="truncate text-xs text-muted-foreground">
                  Next up: <span className="font-semibold text-foreground">{nextUp.name}</span>
                </p>
              )}
            </div>
            {user.role === 'ADMIN' && (
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={onRefill}>
                  Log for them
                </Button>
                <Button size="sm" variant="outline" className="h-9 rounded-xl px-3 text-xs" onClick={onSkip}>
                  Skip
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            No active members in this rotation — an admin needs to add people.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(new Date(iso))
}
