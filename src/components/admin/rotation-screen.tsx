'use client'

// Admin console for the LIVE Rotation Queue — standalone from Schedules.
// Manage per-dispenser queues: membership, order, whose turn it is, and the
// turn history. No dates involved anywhere: turns advance when people act.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { UserAvatar } from '@/components/shared/status-badge'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { api, proofUrl } from '@/lib/api-client'
import { formatDateTime } from '@/lib/tz'
import type { DispenserDTO, MemberDTO, RotationQueueDTO, RotationTurnDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  Hand,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

export function AdminRotationScreen() {
  const rotationQ = useQuery({ queryKey: ['rotation'], queryFn: api.rotation, refetchInterval: 8000 })
  const dispensersQ = useQuery({ queryKey: ['admin-dispensers'], queryFn: api.dispensers })
  const membersQ = useQuery({ queryKey: ['admin-members'], queryFn: api.members })
  const queryClient = useQueryClient()
  const [proof, setProof] = useState<ProofInfo | null>(null)

  const queues = rotationQ.data?.queues ?? []
  const dispensers = dispensersQ.data?.dispensers ?? []
  const withoutQueue = dispensers.filter((d) => !queues.some((q) => q.dispenser.id === d.id))

  function applyQueue(fresh: RotationQueueDTO) {
    queryClient.setQueryData<{ queues: RotationQueueDTO[] }>(['rotation'], (old) =>
      old ? { queues: old.queues.map((q) => (q.id === fresh.id ? fresh : q)) } : old
    )
  }

  function removeQueue(id: string) {
    queryClient.setQueryData<{ queues: RotationQueueDTO[] }>(['rotation'], (old) =>
      old ? { queues: old.queues.filter((q) => q.id !== id) } : old
    )
  }

  async function enableRotation(dispenser: DispenserDTO) {
    try {
      const { queue } = await api.createRotationQueue(dispenser.id)
      toast.success(`Rotation enabled for ${dispenser.name} — members were seeded, adjust the order anytime`)
      applyQueue(queue)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enable rotation')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-bold text-primary">
            Live rotation — the person-chain, zero dates
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Rotation is per dispenser and fully opt-in: enable it below or create a rotation
            schedule for a dispenser. The turn advances the moment someone logs a refill or skips
            — even several times a day. Completing a scheduled task passes the turn too. Inactive
            members are skipped automatically.
          </p>
        </div>
      </div>

      {rotationQ.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      )}

      {withoutQueue.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Dispensers without rotation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            <p className="text-xs text-muted-foreground">
              These dispensers don&apos;t have live rotation. Enable it here, or create a rotation
              schedule — members are seeded automatically and you can adjust the order after.
            </p>
            {withoutQueue.map((d) => (
              <div
                key={d.id}
                className="flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2"
              >
                <span aria-hidden className="text-lg">
                  🫙
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  {d.location && (
                    <p className="truncate text-xs text-muted-foreground">{d.location}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="h-9 gap-1.5 rounded-xl px-3 text-xs"
                  onClick={() => enableRotation(d)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Enable rotation
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!rotationQ.isLoading && queues.length === 0 && dispensers.length > 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No rotation queues yet — enable one above or create a rotation schedule.
        </p>
      )}

      {queues.map((q) => (
        <AdminQueueCard
          key={q.id}
          queue={q}
          members={membersQ.data?.members ?? []}
          onQueueChange={applyQueue}
          onQueueRemoved={removeQueue}
          onShowProof={setProof}
        />
      ))}

      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}

function AdminQueueCard({
  queue,
  members,
  onQueueChange,
  onQueueRemoved,
  onShowProof,
}: {
  queue: RotationQueueDTO
  members: MemberDTO[]
  onQueueChange: (q: RotationQueueDTO) => void
  onQueueRemoved: (id: string) => void
  onShowProof: (p: ProofInfo) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addUserId, setAddUserId] = useState<string>('')

  const inQueue = new Set(queue.members.map((m) => m.userId))
  const candidates = members.filter((m) => m.isActive && !inQueue.has(m.id))

  async function run(key: string, fn: () => Promise<{ queue: RotationQueueDTO }>) {
    setBusy(key)
    try {
      const { queue: fresh } = await fn()
      onQueueChange(fresh)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  async function removeMember(userId: string) {
    setBusy('remove-' + userId)
    try {
      const { queue: fresh } = await api.removeRotationMember(queue.id, userId)
      onQueueChange(fresh)
      toast.success('Member removed from the rotation')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove member')
    } finally {
      setBusy(null)
      setConfirmRemove(null)
    }
  }

  async function deleteQueue() {
    setBusy('delete')
    try {
      await api.deleteRotationQueue(queue.id)
      toast.success(`Live rotation disabled for ${queue.dispenser.name}`)
      onQueueRemoved(queue.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not disable rotation')
    } finally {
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base leading-tight">
            <span aria-hidden>🫙</span>
            <span className="truncate">{queue.dispenser.name}</span>
            {!queue.dispenser.isActive && (
              <Badge variant="outline" className="rounded-full">
                Dispenser inactive
              </Badge>
            )}
          </CardTitle>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {queue.dispenser.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden /> {queue.dispenser.location}
              </span>
            )}
            <span>
              {queue.todayTurns} today · {queue.totalTurns} total
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 gap-1.5 rounded-xl px-2.5 text-xs text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={busy === 'delete'}
        >
          {busy === 'delete' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          )}
          Disable
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4">
        {/* On duty / next */}
        <div className="flex flex-wrap items-center gap-2">
          {queue.onDuty ? (
            <Badge className="gap-1 rounded-full px-3 py-1.5">
              <Hand className="h-3.5 w-3.5" aria-hidden /> On duty: {queue.onDuty.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-3 py-1.5">
              Nobody on duty — add active members
            </Badge>
          )}
          {queue.nextUp && queue.onDuty && (
            <Badge variant="outline" className="rounded-full px-3 py-1.5">
              Next: {queue.nextUp.name}
            </Badge>
          )}
        </div>

        {/* Members manager */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Turn order
          </p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {queue.members.map((m, idx) => (
              <li
                key={m.userId}
                className={cn(
                  'flex min-h-[48px] items-center gap-2 rounded-xl border px-2.5 py-1.5',
                  m.isOnDuty ? 'border-primary/40 bg-primary/10' : 'bg-card',
                  !m.isActive && 'opacity-60'
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <UserAvatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.turnsToday}× today · {m.turnsTotal} total
                    {!m.isActive && ' · inactive (skipped)'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Move ${m.name} up`}
                    disabled={idx === 0 || busy !== null}
                    onClick={() => run('up-' + m.userId, () => api.reorderRotation(queue.id, m.userId, 'up'))}
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Move ${m.name} down`}
                    disabled={idx === queue.members.length - 1 || busy !== null}
                    onClick={() => run('down-' + m.userId, () => api.reorderRotation(queue.id, m.userId, 'down'))}
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </Button>
                  {!m.isOnDuty && m.isActive && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Give the turn to ${m.name}`}
                      disabled={busy !== null}
                      onClick={() =>
                        run('turn-' + m.userId, () => api.setRotationTurn(queue.id, m.userId))
                      }
                    >
                      <Hand className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${m.name} from rotation`}
                    disabled={busy !== null}
                    onClick={() => setConfirmRemove(m.userId)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
            {queue.members.length === 0 && (
              <li className="rounded-xl border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
                Empty queue — add members below.
              </li>
            )}
          </ul>
        </div>

        {/* Add member */}
        <div className="flex items-center gap-2">
          <Select value={addUserId} onValueChange={setAddUserId}>
            <SelectTrigger className="h-11 flex-1 rounded-xl" aria-label="Choose a member to add">
              <SelectValue placeholder="Add a member to the rotation…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Everyone is already in</div>
              )}
              {candidates.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-11 rounded-xl px-4"
            disabled={!addUserId || busy !== null}
            onClick={() => {
              const id = addUserId
              setAddUserId('')
              run('add', () => api.addRotationMember(queue.id, id))
            }}
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add
          </Button>
        </div>

        <Separator />

        {/* Turn history */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Turn history
          </p>
          {queue.recentTurns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No turns logged yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {queue.recentTurns.map((t) => (
                <AdminTurnRow
                  key={t.id}
                  turn={t}
                  dispenserName={queue.dispenser.name}
                  onShowProof={onShowProof}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {/* Remove member confirm */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from rotation?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const m = queue.members.find((x) => x.userId === confirmRemove)
                if (!m) return null
                return m.isOnDuty
                  ? `${m.name} is on duty right now — removing them passes the turn to the next active member.`
                  : `Remove ${m.name} from the ${queue.dispenser.name} rotation? Their past turns stay in the history.`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (confirmRemove) removeMember(confirmRemove)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete queue confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable live rotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the queue for “{queue.dispenser.name}” — turn order and history are
              removed. Scheduled tasks are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                deleteQueue()
              }}
            >
              Disable rotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function AdminTurnRow({
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
      <Badge variant={turn.status === 'DONE' ? 'secondary' : 'outline'} className="shrink-0 rounded-full">
        {turn.status === 'DONE' ? 'Done' : 'Skipped'}
      </Badge>
    </li>
  )
}
