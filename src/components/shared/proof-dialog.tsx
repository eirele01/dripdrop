'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { WaterLevelBadge } from '@/components/shared/status-badge'
import { formatDateTime } from '@/lib/tz'

export interface ProofInfo {
  url: string
  userName?: string
  dispenserName?: string
  completedAt?: string | null
  waterLevel?: 'FULL' | 'HALF' | 'EMPTY' | null
  note?: string | null
}

export function ProofDialog({
  proof,
  onClose,
}: {
  proof: ProofInfo | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!proof} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        {proof && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                📸 Refill proof
              </DialogTitle>
              <DialogDescription>
                {proof.userName ? `Submitted by ${proof.userName}` : 'Photo proof of completion'}
                {proof.completedAt ? ` · ${formatDateTime(proof.completedAt)}` : ''}
              </DialogDescription>
            </DialogHeader>
            { }
            <img
              src={proof.url}
              alt={`Refill proof${proof.dispenserName ? ` for ${proof.dispenserName}` : ''}`}
              className="max-h-[55vh] w-full rounded-xl border object-contain"
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {proof.dispenserName && (
                <span className="rounded-full bg-muted px-3 py-1">{proof.dispenserName}</span>
              )}
              {proof.waterLevel && <WaterLevelBadge level={proof.waterLevel} />}
              <a
                href={proof.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Open full image ↗
              </a>
            </div>
            {proof.note && (
              <>
                <Separator />
                <p className="text-sm italic text-muted-foreground">“{proof.note}”</p>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
