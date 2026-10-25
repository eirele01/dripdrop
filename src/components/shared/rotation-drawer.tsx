'use client'

// Bottom drawer for the LIVE Rotation Queue: log a refill with NO due date —
// photo is optional (speed matters when a dispenser empties several times a
// day). Submitting instantly advances the turn to the next member.
import { useEffect, useRef, useState } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { WaterLevelBadge } from '@/components/shared/status-badge'
import { api, compressImage, formatBytes, proofUrl } from '@/lib/api-client'
import type { RotationQueueDTO, WaterLevel } from '@/lib/types'
import { Camera, Loader2, MapPin, RefreshCcw, X } from 'lucide-react'
import { toast } from 'sonner'

const LEVELS: { value: WaterLevel; label: string; emoji: string }[] = [
  { value: 'EMPTY', label: 'Empty', emoji: '🫙' },
  { value: 'HALF', label: 'Half', emoji: '🥤' },
  { value: 'FULL', label: 'Full', emoji: '🚰' },
]

export function RotationDrawer({
  queue,
  onOpenChange,
  onLogged,
}: {
  queue: RotationQueueDTO | null
  onOpenChange: (open: boolean) => void
  onLogged: (queue: RotationQueueDTO) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [level, setLevel] = useState<WaterLevel | null>(null)
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!queue) {
      setFile(null)
      setLevel(null)
      setNote('')
      if (preview) {
        URL.revokeObjectURL(preview)
        setPreview(null)
      }
    }
  }, [queue, preview])

  function pickFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    if (!f) {
      setFile(null)
      setPreview(null)
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function submit() {
    if (!queue) return
    setUploading(true)
    try {
      const fd = new FormData()
      if (file) {
        const blob = await compressImage(file)
        fd.append('photo', new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }))
      }
      if (level) fd.append('waterLevel', level)
      if (note.trim()) fd.append('note', note.trim().slice(0, 500))
      const { queue: fresh } = await api.rotationRefill(queue.id, fd)
      const nextName = fresh.onDuty?.name
      const nextIsYou = fresh.onDuty && fresh.isMyTurn
      toast.success(
        nextName
          ? nextIsYou
            ? `Refill logged 💧 Still your turn — you're the only active member`
            : `Refill logged 💧 Next up: ${nextName}`
          : 'Refill logged 💧'
      )
      onLogged(fresh)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not log the refill')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Drawer open={!!queue} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-3xl sm:mx-auto sm:max-w-md">
        {queue && (
          <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle className="flex items-center gap-2 text-xl">
                💧 Log refill — “{queue.dispenser.name}”
              </DrawerTitle>
              <DrawerDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {queue.dispenser.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {queue.dispenser.location}
                  </span>
                )}
                <span>No due date — log it and the turn moves on instantly</span>
              </DrawerDescription>
            </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo of the refilled dispenser (optional)"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />

            {!preview ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
              >
                <Camera className="h-8 w-8" aria-hidden />
                <span className="text-sm font-semibold">Add a photo (optional)</span>
                <span className="text-xs text-muted-foreground">Proof helps, but speed matters more</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative h-44 w-full overflow-hidden rounded-2xl border">
                  <img
                    src={preview}
                    alt="Preview of refill proof"
                    className="h-44 w-full object-cover"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    aria-label="Remove photo"
                    className="absolute right-2 top-2 h-8 w-8 rounded-full opacity-90"
                    onClick={() => pickFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {file?.name ?? 'photo'} · {file ? formatBytes(file.size) : ''}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => inputRef.current?.click()}
                  >
                    <RefreshCcw className="h-3 w-3" /> Retake
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-1.5">
              <p className="text-sm font-medium">
                Water level before refill <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Water level before refill">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    aria-pressed={level === l.value}
                    onClick={() => setLevel(level === l.value ? null : l.value)}
                    className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-sm transition-colors ${
                      level === l.value
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'bg-card text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <span aria-hidden>{l.emoji}</span>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional) — e.g. 2nd bottle today, grabbed from storage"
              className="mt-4 min-h-[60px] rounded-xl"
              maxLength={500}
            />
            </div>

            <DrawerFooter className="px-0 pb-0">
              <Button
                type="button"
                size="lg"
                className="h-14 w-full rounded-2xl text-lg font-bold shadow-lg shadow-primary/25"
                disabled={uploading}
                onClick={submit}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Logging…
                  </>
                ) : (
                  'Log refill & pass the turn ✓'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => onOpenChange(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
            </DrawerFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
