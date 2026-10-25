'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { TaskCard } from '@/components/shared/task-card'
import { ProofDialog, type ProofInfo } from '@/components/shared/proof-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, FilterX } from 'lucide-react'
import type { TaskStatus } from '@/lib/types'

export function HistoryScreen() {
  const [status, setStatus] = useState<TaskStatus | ''>('')
  const [dispenserId, setDispenserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [proof, setProof] = useState<ProofInfo | null>(null)

  const { data: dispensersData } = useQuery({ queryKey: ['dispensers'], queryFn: api.dispensersAll })

  const filters = useMemo(
    () => ({ status, dispenserId, from, to, page }),
    [status, dispenserId, from, to, page]
  )

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['history', filters],
    queryFn: () => api.history(filters),
    placeholderData: (prev) => prev,
  })

  const hasFilter = status || dispenserId || from || to

  function resetFilters() {
    setStatus('')
    setDispenserId('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">My history</h1>
        <p className="text-sm text-muted-foreground">Every refill you completed or missed</p>
      </header>

      <div className="grid grid-cols-2 gap-2" role="search" aria-label="History filters">
        <Select
          value={status || 'ALL'}
          onValueChange={(v) => {
            setStatus(v === 'ALL' ? '' : (v as TaskStatus))
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filter by status" className="h-11 rounded-xl w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="DONE">Done</SelectItem>
            <SelectItem value="MISSED">Missed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dispenserId || 'ALL'}
          onValueChange={(v) => {
            setDispenserId(v === 'ALL' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filter by dispenser" className="h-11 rounded-xl w-full">
            <SelectValue placeholder="Dispenser" />
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
        <Input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value)
            setPage(1)
          }}
          className="h-11 rounded-xl"
        />
        <Input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value)
            setPage(1)
          }}
          className="h-11 rounded-xl"
        />
        {hasFilter && (
          <Button variant="ghost" size="sm" className="col-span-2 h-9 gap-1.5" onClick={resetFilters}>
            <FilterX className="h-4 w-4" /> Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : !data || data.tasks.length === 0 ? (
        <EmptyState
          emoji="🗂️"
          title="Nothing here yet"
          subtitle={hasFilter ? 'No refills match these filters.' : 'Your refills will appear here after your first shift.'}
        />
      ) : (
        <>
          <div className={`space-y-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            {data.tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                isMine
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

          <nav className="flex items-center justify-between gap-2" aria-label="History pagination">
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
        </>
      )}

      <ProofDialog proof={proof} onClose={() => setProof(null)} />
    </div>
  )
}
