'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { TaskCard } from '@/components/shared/task-card'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Trash2,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { todayStr, dateStrOf, shanghaiParts } from '@/lib/tz'
import type { TaskDTO, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const pad2 = (n: number) => String(n).padStart(2, '0')

export function TasksScreen() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [memberId, setMemberId] = useState('')
  const [dispenserId, setDispenserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [proof, setProof] = useState<ProofInfo | null>(null)
  const [reassignTask, setReassignTask] = useState<TaskDTO | null>(null)
  const [editTask, setEditTask] = useState<TaskDTO | null>(null)
  const [deleteTask, setDeleteTask] = useState<TaskDTO | null>(null)

  const { data: membersData } = useQuery({ queryKey: ['members'], queryFn: api.members })
  const { data: dispensersData } = useQuery({ queryKey: ['dispensers'], queryFn: api.dispensersAll })

  const filters = useMemo(
    () => ({ scope: 'all' as const, status, dispenserId, from, to, page, memberId }),
    [status, dispenserId, from, to, page, memberId]
  )

  // Server sorts TODAY'S TASKS FIRST (then newest first) and filters by
  // member/dispenser/status/date server-side, so pagination stays exact.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['adminTasks', filters],
    queryFn: () => api.history(filters),
    placeholderData: (prev) => prev,
  })

  const tasks = data?.tasks ?? []

  // Split for section headers — the server already guarantees "today first".
  const today = todayStr()
  const todayCount = tasks.filter((t) => dateStrOf(new Date(t.dueAt)) === today).length

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.updateTask(id, body),
    onSuccess: () => {
      toast.success('Task updated')
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      toast.success('Task deleted')
      setDeleteTask(null)
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const activeCount = [status, dispenserId, memberId, from, to].filter(Boolean).length

  function clearFilters() {
    setStatus('')
    setMemberId('')
    setDispenserId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  function renderTask(t: TaskDTO) {
    return (
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
        footer={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs"
              onClick={() => setReassignTask(t)}
            >
              <UserCog className="h-3.5 w-3.5" /> Reassign
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs"
              onClick={() => setEditTask(t)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Select
              value={t.status}
              onValueChange={(v) => patch.mutate({ id: t.id, body: { status: v } })}
            >
              <SelectTrigger
                aria-label={`Change status for ${t.dispenser.name}`}
                className="h-8 w-[128px] rounded-lg text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Mark pending</SelectItem>
                <SelectItem value="DONE">Mark done</SelectItem>
                <SelectItem value="MISSED">Mark missed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6 rounded-lg text-muted-foreground hover:text-destructive"
              aria-label={`Delete task for ${t.dispenser.name}`}
              onClick={() => setDeleteTask(t)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        }
      />
    )
  }

  const todayTasks = tasks.filter((t) => dateStrOf(new Date(t.dueAt)) === today)
  const otherTasks = tasks.filter((t) => dateStrOf(new Date(t.dueAt)) !== today)
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">All tasks</h1>
        <p className="text-sm text-muted-foreground">
          Today&apos;s tasks first — review, edit, reassign, or clean up any refill task
        </p>
      </header>

      {/* Filter toggle + expandable filter panel */}
      <div className="space-y-2" role="search" aria-label="Task filters">
        <div className="flex items-center gap-2">
          <Button
            variant={filtersOpen ? 'secondary' : 'outline'}
            className="h-10 flex-1 gap-2 rounded-xl sm:flex-none sm:px-5"
            aria-expanded={filtersOpen}
            aria-controls="task-filter-panel"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
            {activeCount > 0 && (
              <Badge className="h-5 rounded-full px-1.5 text-[10px] leading-none">{activeCount}</Badge>
            )}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', filtersOpen && 'rotate-180')}
              aria-hidden
            />
          </Button>
          {activeCount > 0 && (
            <Button variant="ghost" className="h-10 gap-1.5 rounded-xl px-3" onClick={clearFilters}>
              <FilterX className="h-4 w-4" /> Clear
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            {data ? `${data.total} task${data.total === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        {filtersOpen && (
          <div id="task-filter-panel" className="space-y-3 rounded-2xl border bg-muted/40 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Member</Label>
                <Select
                  value={memberId || 'ALL'}
                  onValueChange={(v) => {
                    setMemberId(v === 'ALL' ? '' : v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger aria-label="Filter by member" className="h-11 rounded-xl bg-card w-full">
                    <SelectValue placeholder="All members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All members</SelectItem>
                    {(membersData?.members ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Dispenser</Label>
                <Select
                  value={dispenserId || 'ALL'}
                  onValueChange={(v) => {
                    setDispenserId(v === 'ALL' ? '' : v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger aria-label="Filter by dispenser" className="h-11 rounded-xl bg-card w-full">
                    <SelectValue placeholder="All dispensers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All dispensers</SelectItem>
                    {(dispensersData?.dispensers ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={status || 'ALL'}
                  onValueChange={(v) => {
                    setStatus(v === 'ALL' ? '' : (v as TaskStatus))
                    setPage(1)
                  }}
                >
                  <SelectTrigger aria-label="Filter by status" className="h-11 rounded-xl bg-card w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                    <SelectItem value="MISSED">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Start & end date share the full width in exactly 2 equal columns */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 w-full">
                <Label htmlFor="tf-from" className="text-xs text-muted-foreground">
                  Start date
                </Label>
                <Input
                  id="tf-from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value)
                    setPage(1)
                  }}
                  onFocus={(e) => e.target.showPicker?.()}
                  className="h-11 w-full rounded-xl bg-card"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tf-to" className="text-xs text-muted-foreground">
                  End date
                </Label>
                <Input
                  id="tf-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setPage(1)
                  }}
                  onFocus={(e) => e.target.showPicker?.()}
                  className="h-11 w-full rounded-xl bg-card"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs"
                onClick={clearFilters}
                disabled={activeCount === 0}
              >
                <FilterX className="h-3.5 w-3.5" /> Reset all
              </Button>
              <Button size="sm" className="h-9 rounded-lg px-5 text-xs" onClick={() => setFiltersOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState emoji="🔍" title="No tasks found" subtitle="Try widening the filters." />
      ) : (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {todayTasks.length > 0 && (
            <section aria-label="Today's tasks" className="space-y-2">
              <h2 className="flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wide text-primary">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Today · {todayTasks.length}
              </h2>
              {todayTasks.map(renderTask)}
            </section>
          )}
          {otherTasks.length > 0 && (
            <section aria-label="Earlier and upcoming tasks" className="space-y-2">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Earlier &amp; upcoming
              </h2>
              {otherTasks.map(renderTask)}
            </section>
          )}
        </div>
      )}

      {data && data.total > 0 && (
        <nav className="flex items-center justify-between gap-2" aria-label="Task pagination">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {totalPages} · {data.total} total
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}

      <ReassignDialog
        task={reassignTask}
        members={membersData?.members ?? []}
        onClose={() => setReassignTask(null)}
        onReassign={(id, assignedToId) => {
          patch.mutate({ id, body: { assignedToId } })
          setReassignTask(null)
        }}
      />

      {editTask && (
        <EditTaskDialog
          key={editTask.id}
          task={editTask}
          members={membersData?.members ?? []}
          saving={patch.isPending}
          onClose={() => setEditTask(null)}
          onSave={(id, body) => {
            patch.mutate({ id, body })
            setEditTask(null)
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTask} onOpenChange={(o) => !o && setDeleteTask(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTask?.dispenser.name} — this removes the task and its history permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTask && del.mutate(deleteTask.id)}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}

function ReassignDialog({
  task,
  members,
  onClose,
  onReassign,
}: {
  task: TaskDTO | null
  members: { id: string; name: string; isActive: boolean }[]
  onClose: () => void
  onReassign: (id: string, assignedToId: string | null) => void
}) {
  return (
    <AlertDialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Reassign task</AlertDialogTitle>
          <AlertDialogDescription>
            {task?.dispenser.name} · due{' '}
            {task
              ? new Date(task.dueAt).toLocaleString('en-US', {
                  timeZone: 'Asia/Shanghai',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Select
          onValueChange={(v) => {
            if (!task) return
            onReassign(task.id, v === 'NONE' ? null : v)
          }}
        >
          <SelectTrigger aria-label="Choose member" className="h-11 rounded-xl w-full">
            <SelectValue placeholder="Pick a member…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">🏠 Unassigned (claimable)</SelectItem>
            {members
              .filter((m) => m.isActive)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl" onClick={onClose}>
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EditTaskDialog({
  task,
  members,
  saving,
  onClose,
  onSave,
}: {
  task: TaskDTO
  members: { id: string; name: string; isActive: boolean }[]
  saving: boolean
  onClose: () => void
  onSave: (id: string, body: Record<string, unknown>) => void
}) {
  const p = shanghaiParts(new Date(task.dueAt))
  const [assignee, setAssignee] = useState(task.assignedTo?.id ?? 'NONE')
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [dueDate, setDueDate] = useState(dateStrOf(new Date(task.dueAt)))
  const [dueTime, setDueTime] = useState(`${pad2(p.hh)}:${pad2(p.mm)}`)

  function submit() {
    if (!dueDate) return toast.error('Pick a due date')
    if (!dueTime) return toast.error('Pick a due time')
    onSave(task.id, {
      assignedToId: assignee === 'NONE' ? null : assignee,
      status,
      dueDate,
      dueTime,
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" aria-hidden /> Edit task
          </DialogTitle>
          <DialogDescription>
            {task.dispenser.name}
            {task.dispenser.location ? ` · ${task.dispenser.location}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="et-assignee">Assigned to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="et-assignee" className="h-11 rounded-xl w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">🏠 Unassigned (claimable)</SelectItem>
                {members
                  .filter((m) => m.isActive)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger id="et-status" className="h-11 rounded-xl w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
                <SelectItem value="MISSED">Missed</SelectItem>
              </SelectContent>
            </Select>
            {task.status !== 'PENDING' && status === 'PENDING' && (
              <p className="text-[11px] text-muted-foreground">
                Re-opening clears the completion time (proof photo is kept).
              </p>
            )}
          </div>

          {/* Due date & time share the row in exactly 2 equal columns */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-date">Due date</Label>
              <Input
                id="et-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onFocus={(e) => e.target.showPicker?.()}
                className="h-11 w-full rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-time">Due time</Label>
              <Input
                id="et-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="h-11 w-full rounded-xl"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className=" rounded-xl px-6 font-bold shadow-md shadow-primary/20"
            onClick={submit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
