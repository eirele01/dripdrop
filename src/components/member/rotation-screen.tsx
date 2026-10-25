'use client'

// Member view of the LIVE Rotation Queue — "whose turn is it right now?".
// No dates anywhere: the turn advances the instant someone logs a refill or
// skips, so a dispenser can be refilled many times a day without waiting.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar, WaterLevelBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { RotationDrawer } from '@/components/shared/rotation-drawer'
import { SkipTurnDialog } from '@/components/shared/skip-turn-dialog'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { api, proofUrl } from '@/lib/api-client'
import { formatDateTime } from '@/lib/tz'
import type { RotationQueueDTO, RotationTurnDTO, SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MapPin, Repeat, SkipForward } from 'lucide-react'

export function RotationScreen({ user }: { user: SessionUser }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rotation'],
    queryFn: api.rotation,
    refetchInterval: 8000,
  })
  const queryClient = useQueryClient()
  const [drawerQueue, setDrawerQueue] = useState<RotationQueueDTO | null>(null)
  const [skipQueue, setSkipQueue] = useState<RotationQueueDTO | null>(null)
  const [proof, setProof] = useState<ProofInfo | null>(null)

  const activeQueues = useMemo(
    () => (data?.queues ?? []).filter((q) => q.dispenser.isActive),
    [data]
  )

  function applyQueue(fresh: RotationQueueDTO) {
    queryClient.setQueryData<{ queues: RotationQueueDTO[] }>(['rotation'], (old) =>
      old ? { queues: old.queues.map((q) => (q.id === fresh.id ? fresh : q)) } : old
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-bold text-primary">Live rotation</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            No schedules, no times — the turn moves to the next person the moment a refill is
            logged. Empty again an hour later? Just log it again. Finishing a scheduled task
            passes the turn too.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {!isLoading && activeQueues.length === 0 && (
        <Card className="rounded-2xl">
          <CardContent className="pt-2">
            <EmptyState
              emoji="🔄"
              title="No rotation set up yet"
              subtitle="When an admin enables rotation for a dispenser — or creates a rotation schedule — it will appear here."
            />
          </CardContent>
        </Card>
      )}

      {activeQueues.map((q) => (
        <RotationCard
          key={q.id}
          queue={q}
          user={user}
          onRefill={() => setDrawerQueue(q)}
          onSkip={() => setSkipQueue(q)}
          onShowProof={(p) => setProof(p)}
        />
      ))}

      <RotationDrawer queue={drawerQueue} onOpenChange={(o) => !o && setDrawerQueue(null)} onLogged={applyQueue} />
      <SkipTurnDialog queue={skipQueue} onClose={() => setSkipQueue(null)} onSkipped={applyQueue} />
      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}

function RotationCard({
  queue,
  user,
  onRefill,
  onSkip,
  onShowProof,
}: {
  queue: RotationQueueDTO
  user: SessionUser
  onRefill: () => void
  onSkip: () => void
  onShowProof: (p: ProofInfo) => void
}) {
  const { onDuty, nextUp, isMyTurn } = queue

  return (
    <Card className={cn('overflow-hidden rounded-2xl', isMyTurn && 'border-primary/50 shadow-md shadow-primary/10')}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base leading-tight">
            <span aria-hidden>🫙</span>
            <span className="truncate">{queue.dispenser.name}</span>
          </CardTitle>
          {queue.dispenser.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden /> {queue.dispenser.location}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-full">
          {queue.todayTurns} turn{queue.todayTurns === 1 ? '' : 's'} today
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4">
        {/* On-duty panel */}
        {onDuty ? (
          isMyTurn ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                It&apos;s your turn 🫵
              </p>
              <p className="mt-1 text-sm text-foreground">
                The dispenser is yours to handle — log it when done, as many times as needed.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <Button
                  size="lg"
                  className="h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/25"
                  onClick={onRefill}
                >
                  💧 I refilled it
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-2xl"
                  onClick={onSkip}
                >
                  <SkipForward className="h-4 w-4" aria-hidden /> Skip my turn
                </Button>
              </div>
            </div>
          ) : (
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl px-3 text-xs"
                    onClick={onSkip}
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            No active members in this queue — an admin needs to add people.
          </div>
        )}

        {/* Queue order */}
        {queue.members.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Turn order
            </p>
            <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {queue.members.map((m) => (
                <li
                  key={m.userId}
                  className={cn(
                    'flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2 text-sm',
                    m.isOnDuty
                      ? 'border-primary/40 bg-primary/10 font-semibold'
                      : m.isActive
                        ? 'bg-card'
                        : 'bg-muted/40 opacity-60'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                      m.isOnDuty ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                    aria-label={`Position ${(m.position ?? 0) + 1}`}
                  >
                    {(m.position ?? 0) + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.turnsToday > 0 && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {m.turnsToday}× today
                    </span>
                  )}
                  {m.isOnDuty ? (
                    <Badge className="shrink-0 rounded-full">On duty</Badge>
                  ) : !m.isActive ? (
                    <Badge variant="outline" className="shrink-0 rounded-full">
                      Inactive
                    </Badge>
                  ) : nextUp?.userId === m.userId ? (
                    <Badge variant="outline" className="shrink-0 rounded-full border-primary/40 text-primary">
                      Next
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recent turns */}
        {queue.recentTurns.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Recent activity
            </p>
            <ul className="space-y-1.5">
              {queue.recentTurns.slice(0, 5).map((t) => (
                <TurnRow key={t.id} turn={t} dispenserName={queue.dispenser.name} onShowProof={onShowProof} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TurnRow({
  turn,
  dispenserName,
  onShowProof,
}: {
  turn: RotationTurnDTO
  dispenserName: string
  onShowProof: (p: ProofInfo) => void
}) {
  return (
    <li className="flex min-h-[44px] items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2">
      {turn.proofPath ? (
        <button
          type="button"
          onClick={() =>
            onShowProof({
              url: proofUrl(turn.proofPath!),
              userName: turn.userName,
              dispenserName,
              completedAt: turn.createdAt,
              waterLevel: turn.waterLevel,
              note: turn.note,
            })
          }
          className="shrink-0 overflow-hidden rounded-lg border"
          aria-label={`View proof photo from ${turn.userName}`}
        >
          <img
            src={proofUrl(turn.proofPath)}
            alt={`Refill proof from ${turn.userName}`}
            className="h-10 w-10 object-cover"
          />
        </button>
      ) : (
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base',
            turn.status === 'DONE' ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-amber-100 dark:bg-amber-900/40'
          )}
          aria-hidden
        >
          {turn.status === 'DONE' ? '✅' : '⏭️'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-semibold">{turn.userName}</span>{' '}
          {turn.status === 'DONE' ? 'logged a refill' : 'skipped the turn'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDateTime(turn.createdAt)}
          {turn.note ? ` · “${turn.note}”` : ''}
        </p>
      </div>
      {turn.waterLevel && <WaterLevelBadge level={turn.waterLevel} />}
    </li>
  )
}

