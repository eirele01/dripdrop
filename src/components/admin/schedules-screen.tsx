'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { EmptyState } from '@/components/shared/empty-state'
import { UserAvatar } from '@/components/shared/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { CalendarDays, Loader2, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { todayStr } from '@/lib/tz'
import type { ScheduleDTO } from '@/lib/types'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function describeRecurrence(s: ScheduleDTO): string {
  if (s.recurrence === 'SINGLE') return 'One-time shift'
  if (s.recurrence === 'DAILY') return 'Every day'
  if (s.recurrence.startsWith('WEEKLY:')) {
    const days = s.recurrence.slice(7).split(',')
    return `Weekly on ${days.map((d) => d[0] + d.slice(1).toLowerCase()).join(', ')}`
  }
  return s.recurrence
}

export function SchedulesScreen() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editSchedule, setEditSchedule] = useState<ScheduleDTO | null>(null)
  const [deleteSchedule, setDeleteSchedule] = useState<ScheduleDTO | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['schedules'], queryFn: api.schedules })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateSchedule(id, { isActive }),
    onSuccess: () => {
      toast.success('Schedule updated')
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteSchedule(id),
    onSuccess: () => {
      toast.success('Schedule deleted — its pending tasks were removed, history kept')
      setDeleteSchedule(null)
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Recurring rules that auto-generate refill tasks for the next 7 days
          </p>
        </div>
        <Button className="h-11 gap-1.5 rounded-xl font-semibold" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New schedule
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : !data || data.schedules.length === 0 ? (
        <EmptyState
          emoji="🗓️"
          title="No schedules yet"
          subtitle="Create your first schedule and tasks will appear on members' Today screens automatically."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.schedules.map((s) => (
            <Card key={s.id} className={`rounded-2xl ${!s.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.dispenser.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {s.recurrence === 'SINGLE' ? (
                          <CalendarDays className="h-3 w-3" />
                        ) : (
                          <Repeat className="h-3 w-3" />
                        )}
                        {describeRecurrence(s)}
                      </span>
                      <span>· {s.dueTime}</span>
                      <span>
                        · from {s.startDate}
                        {s.endDate ? ` to ${s.endDate}` : ''}
                      </span>
                    </p>
                  </div>
                  <Switch
                    aria-label={s.isActive ? 'Pause schedule' : 'Resume schedule'}
                    checked={s.isActive}
                    onCheckedChange={(v) => toggle.mutate({ id: s.id, isActive: v })}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {s.assignedTo ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      <UserAvatar name={s.assignedTo.name} className="h-5 w-5 text-[9px]" />
                      {s.assignedTo.name}
                    </span>
                  ) : s.rotationMembers.length > 0 ? (
                    <div className="w-full space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        🔄 Rotation order — advances after each completed refill
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.rotationMembers.map((r, i) => {
                          const isNext = s.nextUp?.id === r.id
                          return (
                            <span
                              key={r.id}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                isNext
                                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                                  : 'bg-accent text-accent-foreground'
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                                  isNext ? 'bg-primary-foreground/25' : 'bg-background/70'
                                }`}
                                aria-hidden
                              >
                                {i + 1}
                              </span>
                              {r.name.split(' ')[0]}
                              {isNext && <span aria-label="is next">⬅ next</span>}
                            </span>
                          )
                        })}
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground"
                          title="Rotation loops back to the first person"
                          aria-label="Rotation loops back to the first person"
                        >
                          ↻
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      ⚠️ Nobody assigned
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2 text-xs"
                      onClick={() => setEditSchedule(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeleteSchedule(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mount per mode so form state re-initializes (create defaults vs edit prefill) */}
      {formOpen && !editSchedule && (
        <ScheduleFormDialog
          key="create"
          open
          initial={null}
          onOpenChange={(o) => {
            setFormOpen(o)
            if (!o) setEditSchedule(null)
          }}
        />
      )}
      {editSchedule && (
        <ScheduleFormDialog
          key={editSchedule.id}
          open
          initial={editSchedule}
          onOpenChange={(o) => {
            setFormOpen(o)
            if (!o) setEditSchedule(null)
          }}
        />
      )}

      <AlertDialog open={!!deleteSchedule} onOpenChange={(o) => !o && setDeleteSchedule(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Future tasks from this schedule are removed too. Already-completed tasks stay in
              history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteSchedule && del.mutate(deleteSchedule.id)}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Create + Edit schedule dialog. `initial` null → create mode; otherwise the
 * form is prefilled and changes PATCH the schedule, regenerating its tasks.
 */
function ScheduleFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ScheduleDTO | null
}) {
  const editing = !!initial
  const qc = useQueryClient()
  const [dispenserId, setDispenserId] = useState(initial?.dispenser.id ?? '')
  const [mode, setMode] = useState<'single' | 'recurring'>(
    initial?.recurrence === 'SINGLE' ? 'single' : 'recurring'
  )
  const [recKind, setRecKind] = useState<'DAILY' | 'WEEKLY'>(
    initial?.recurrence.startsWith('WEEKLY:') ? 'WEEKLY' : 'DAILY'
  )
  const [days, setDays] = useState<string[]>(
    initial?.recurrence.startsWith('WEEKLY:') ? initial.recurrence.slice(7).split(',') : ['MON', 'THU']
  )
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayStr())
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [dueTime, setDueTime] = useState(initial?.dueTime ?? '09:00')
  const [rotate, setRotate] = useState((initial?.rotationMembers.length ?? 0) > 0)
  const [assignedToId, setAssignedToId] = useState(initial?.assignedTo?.id ?? '')
  const [rotationIds, setRotationIds] = useState<string[]>(
    initial?.rotationMembers.map((r) => r.id) ?? []
  )

  const { data: dispensersData } = useQuery({ queryKey: ['dispensers'], queryFn: api.dispensersAll })
  const { data: membersData } = useQuery({ queryKey: ['members'], queryFn: api.members })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? api.updateSchedule(initial!.id, body) : api.createSchedule(body),
    onSuccess: () => {
      toast.success(
        editing
          ? 'Schedule updated — pending tasks were regenerated to match ✨'
          : 'Schedule created — tasks generated for the next 7 days ✨'
      )
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      onOpenChange(false)
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Could not save the schedule'),
  })

  function submit() {
    if (!editing && !dispenserId) return toast.error('Pick a dispenser')
    if (!startDate) return toast.error('Pick a start date')
    const recurrence =
      mode === 'single' ? 'SINGLE' : recKind === 'DAILY' ? 'DAILY' : `WEEKLY:${days.join(',')}`
    if (mode === 'recurring' && recKind === 'WEEKLY' && days.length === 0)
      return toast.error('Pick at least one weekday')
    const body: Record<string, unknown> = {
      dispenserId,
      recurrence,
      startDate,
      dueTime,
      endDate: endDate || null,
    }
    if (endDate && endDate < startDate) return toast.error('End date must be after start date')
    if (rotate) {
      if (rotationIds.length < 2) return toast.error('Rotation needs at least 2 members')
      body.rotationMemberIds = rotationIds
    } else {
      if (!assignedToId) return toast.error('Pick an assigned member')
      body.assignedToId = assignedToId
    }
    save.mutate(body)
  }

  const members = (membersData?.members ?? []).filter((m) => m.isActive)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? '✏️ Edit schedule' : '💧 New refill schedule'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Pending tasks for the next 7 days are regenerated to match the new rules.'
              : 'Tasks appear automatically on the assigned member\u2019s Today screen.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Dispenser</Label>
            {editing ? (
              <Select value={dispenserId} disabled>
                <SelectTrigger aria-label="Dispenser" className="h-11 rounded-xl opacity-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={dispenserId}>{initial?.dispenser.name}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={dispenserId} onValueChange={setDispenserId}>
                <SelectTrigger aria-label="Dispenser" className="h-11 rounded-xl w-full">
                  <SelectValue placeholder="Choose a dispenser…" />
                </SelectTrigger>
                <SelectContent>
                  {(dispensersData?.dispensers ?? [])
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                        {d.location ? ` — ${d.location}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Schedule type">
              {(
                [
                  { id: 'recurring', label: '🔁 Repeating' },
                  { id: 'single', label: '1️⃣ Single date' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    mode === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'recurring' && (
            <div className="space-y-1.5 w-full">
              <Label>Repeats</Label>
              <div className="space-y-1.5 gap-2">
                <Select value={recKind} onValueChange={(v) => setRecKind(v as 'DAILY' | 'WEEKLY')}>
                  <SelectTrigger aria-label="Recurrence" className="h-11 rounded-xl w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Every day</SelectItem>
                    <SelectItem value="WEEKLY">Specific weekdays</SelectItem>
                  </SelectContent>
                </Select>
                {recKind === 'WEEKLY' && (
                  <div className="col-span-1 grid grid-cols-4 gap-1 sm:grid-cols-7" role="group" aria-label="Weekdays">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={days.includes(d)}
                        onClick={() =>
                          setDays((prev) =>
                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                          )
                        }
                        className={`min-h-[38px] rounded-lg border text-[11px] font-semibold transition-colors ${
                          days.includes(d)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {d[0] + d.slice(1, 2).toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="sc-start">Start date</Label>
              <Input
                id="sc-start"
                type="date"
                value={startDate}
                min={editing ? undefined : todayStr()}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="sc-end">End (optional)</Label>
              <Input
                id="sc-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="sc-time">Due time</Label>
              <Input
                id="sc-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl bg-muted/60 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="sc-rotate" className="text-sm font-medium">
                🔄 Auto-rotate between members
              </Label>
              <Switch id="sc-rotate" checked={rotate} onCheckedChange={setRotate} />
            </div>
            {rotate ? (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors ${
                      rotationIds.includes(m.id)
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'bg-card'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--primary)]"
                      checked={rotationIds.includes(m.id)}
                      onChange={(e) =>
                        setRotationIds((prev) =>
                          e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)
                        )
                      }
                    />
                    {rotationIds.includes(m.id) && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                        {rotationIds.indexOf(m.id) + 1}
                      </span>
                    )}
                    {m.name}
                  </label>
                ))}
                {rotationIds.length > 0 && (
                  <p className="col-span-2 rounded-lg bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary">
                    Order: {rotationIds.map((id, i) => `${i + 1}. ${members.find((m) => m.id === id)?.name.split(' ')[0] ?? '?'}`).join(' → ')}{' '}
                    ↻
                  </p>
                )}
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  Tap members in turn order (pick 2+). This order also drives the dispenser&apos;s
                  live rotation queue — so refills logged outside the schedule follow the same
                  chain, and any completed refill passes the turn to the next person instantly.
                </p>
              </div>
            ) : (
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger aria-label="Assigned member" className="h-11 rounded-xl bg-card w-full">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl px-6 font-bold shadow-md shadow-primary/20"
            onClick={submit}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editing ? (
              'Save changes'
            ) : (
              'Create schedule'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
