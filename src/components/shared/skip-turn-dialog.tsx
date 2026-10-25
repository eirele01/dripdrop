'use client'

// Shared "pass the turn" dialog for the Live Rotation Queue. Confirming skips
// moves the turn straight to the next active member — no date involved.
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api-client'
import type { RotationQueueDTO } from '@/lib/types'
import { Loader2, SkipForward } from 'lucide-react'
import { toast } from 'sonner'

export function SkipTurnDialog({
  queue,
  onClose,
  onSkipped,
}: {
  queue: RotationQueueDTO | null
  onClose: () => void
  onSkipped: (q: RotationQueueDTO) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!queue) return
    setBusy(true)
    try {
      const { queue: fresh } = await api.rotationSkip(
        queue.id,
        note.trim().slice(0, 300) || undefined
      )
      toast.success(
        fresh.onDuty
          ? `Turn skipped → Next up: ${fresh.onDuty.name}${fresh.isMyTurn ? " (that's you)" : ''}`
          : 'Turn skipped'
      )
      onSkipped(fresh)
      setNote('')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not skip the turn')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!queue} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        {queue && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SkipForward className="h-5 w-5 text-primary" aria-hidden /> Skip your turn?
              </DialogTitle>
              <DialogDescription>
                The turn moves straight to{' '}
                <span className="font-semibold text-foreground">
                  {queue.nextUp?.name ?? 'the next person'}
                </span>
                . They can refill right away — no waiting.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason (optional) — e.g. out of office today"
              maxLength={300}
              className="min-h-[60px] rounded-xl"
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={onClose} disabled={busy} className="h-11">
                Cancel
              </Button>
              <Button onClick={confirm} disabled={busy} className="h-11 rounded-xl">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Skip turn
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
