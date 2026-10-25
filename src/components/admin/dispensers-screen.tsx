'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { Droplets, Loader2, MapPin, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import type { DispenserDTO } from '@/lib/types'

export function DispensersScreen() {
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState<DispenserDTO | 'new' | null>(null)
  const [deleteD, setDeleteD] = useState<DispenserDTO | null>(null)
  const [qrDispenser, setQrDispenser] = useState<DispenserDTO | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['dispensers'], queryFn: api.dispensersAll })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteDispenser(id),
    onSuccess: () => {
      toast.success('Dispenser deleted')
      setDeleteD(null)
      qc.invalidateQueries({ queryKey: ['dispensers'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dispensers</h1>
          <p className="text-sm text-muted-foreground">The water coolers your team keeps full</p>
        </div>
        <Button className="h-11 gap-1.5 rounded-xl font-semibold" onClick={() => setEditOpen('new')}>
          <Plus className="h-4 w-4" /> Add dispenser
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : !data || data.dispensers.length === 0 ? (
        <EmptyState
          emoji="🚰"
          title="No dispensers yet"
          subtitle="Add your first water dispenser to start scheduling refills."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.dispensers.map((d) => (
            <Card key={d.id} className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-950 dark:to-sky-950"
                  >
                    <Droplets className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{d.name}</p>
                      {!d.isActive && <Badge variant="secondary">Paused</Badge>}
                    </div>
                    {d.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {d.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg text-xs"
                    onClick={() => setEditOpen(d)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg text-xs"
                    onClick={() => setQrDispenser(d)}
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-8 gap-1.5 rounded-lg text-xs text-destructive hover:text-destructive"
                    onClick={() => setDeleteD(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EditDispenserDialogWithMount dispenser={editOpen} onOpenChange={setEditOpen} />

      {qrDispenser && <QRDialog key={qrDispenser.id} dispenser={qrDispenser} onClose={() => setQrDispenser(null)} />}

      <AlertDialog open={!!deleteD} onOpenChange={(o) => !o && setDeleteD(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteD?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes its schedules and all refill tasks/proofs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteD && del.mutate(deleteD.id)}
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

function EditDispenserDialogWithMount({
  dispenser,
  onOpenChange,
}: {
  dispenser: DispenserDTO | 'new' | null
  onOpenChange: (v: DispenserDTO | 'new' | null) => void
}) {
  // Mount only while editing so internal state resets fresh every time
  if (!dispenser) return null
  return (
    <EditDispenserDialog
      key={dispenser === 'new' ? 'new' : dispenser.id}
      dispenser={dispenser}
      onOpenChange={onOpenChange}
    />
  )
}

function EditDispenserDialog({
  dispenser,
  onOpenChange,
}: {
  dispenser: DispenserDTO | 'new'
  onOpenChange: (v: DispenserDTO | 'new' | null) => void
}) {
  const qc = useQueryClient()
  const isNew = dispenser === 'new'
  const initial = isNew
    ? { name: '', location: '', isActive: true }
    : { name: dispenser.name, location: dispenser.location ?? '', isActive: dispenser.isActive }
  const [name, setName] = useState(initial.name)
  const [location, setLocation] = useState(initial.location)
  const [isActive, setIsActive] = useState(initial.isActive)

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: name.trim(), location: location.trim() }
      if (isNew) return api.createDispenser(body as { name: string })
      return api.updateDispenser((dispenser as DispenserDTO).id, { ...body, isActive })
    },
    onSuccess: () => {
      toast.success(isNew ? 'Dispenser added 🚰' : 'Dispenser updated')
      qc.invalidateQueries({ queryKey: ['dispensers'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  return (
    <Dialog open={!!dispenser} onOpenChange={(o) => !o && onOpenChange(null)}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? '🚰 Add dispenser' : '✏️ Edit dispenser'}</DialogTitle>
          <DialogDescription>Give it a friendly name people recognize.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dp-name">Name</Label>
            <Input
              id="dp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen Corner"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-loc">Location</Label>
            <Input
              id="dp-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 3F pantry, beside the sink"
              className="h-11 rounded-xl"
            />
          </div>
          {!isNew && (
            <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5">
              <Label htmlFor="dp-active" className="text-sm">
                Active (shows for new schedules)
              </Label>
              <Switch id="dp-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(null)}>
            Cancel
          </Button>
          <Button
            className="h-11 rounded-xl px-6 font-bold"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isNew ? 'Add' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QRDialog({ dispenser, onClose }: { dispenser: DispenserDTO; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    const url = `${window.location.origin}/?refill=${dispenser.id}`
    let cancelled = false
    QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#0e5a6d', light: '#ffffff' } })
      .then((data) => {
        if (!cancelled) setQr(data)
      })
      .catch(() => setQr(null))
    return () => {
      cancelled = true
    }
  }, [dispenser])

  return (
    <Dialog open={!!dispenser} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>📱 QR code — {dispenser?.name}</DialogTitle>
          <DialogDescription>
            Print and stick it on the dispenser. Members who scan it jump straight to the refill
            screen for this dispenser.
          </DialogDescription>
        </DialogHeader>
        {qr ? (
          <div className="flex flex-col items-center gap-3">
            { }
            <img src={qr} alt={`QR code for ${dispenser?.name}`} className="rounded-2xl border p-2" />
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                const a = document.createElement('a')
                a.href = qr
                a.download = `dripdrop-qr-${dispenser?.name ?? 'dispenser'}.png`
                a.click()
                toast.success('QR code downloaded')
              }}
            >
              ⬇️ Download QR
            </Button>
          </div>
        ) : (
          <Skeleton className="mx-auto h-64 w-64 rounded-2xl" />
        )}
      </DialogContent>
    </Dialog>
  )
}
