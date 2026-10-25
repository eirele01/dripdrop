// POST /api/rotation/[id]/refill — log a refill for the person ON DUTY and
// advance the turn pointer instantly (no dates involved). The turn always
// belongs to the on-duty member, even when an admin acts on their behalf.
import { s3Upload } from '@/lib/s3'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'
import {
  loadQueue,
  resolveOnDuty,
  assertCanAct,
  recordTurnAndAdvance,
  reloadQueue,
  buildQueueDTO,
} from '@/lib/rotation-queue'

const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10MB
const WATER_LEVELS: readonly string[] = ['FULL', 'HALF', 'EMPTY']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireUser()

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new HttpError(400, 'Expected multipart/form-data body')
    }

    const queue = await loadQueue(id)
    if (!queue) throw new HttpError(404, 'Rotation queue not found')

    const onDuty = resolveOnDuty(queue.members, queue.currentUserId)
    assertCanAct(user, onDuty)
    // assertCanAct already rejects non-admins when nobody is on duty; admins
    // still need an on-duty person to attribute the turn to.
    if (!onDuty) throw new HttpError(409, 'No active members in this rotation queue')

    const photoEntry = form.get('photo')
    if (photoEntry && typeof photoEntry === 'string') {
      throw new HttpError(400, 'Photo must be an image file')
    }
    const photo = photoEntry instanceof File ? photoEntry : null
    if (photo) {
      if (!photo.type.startsWith('image/')) {
        throw new HttpError(400, 'Photo must be an image file')
      }
      if (photo.size > MAX_PHOTO_BYTES) {
        throw new HttpError(400, 'Photo must be 10MB or smaller')
      }
    }

    const waterLevelRaw = ((form.get('waterLevel') as string | null) ?? '').trim()
    if (waterLevelRaw && !WATER_LEVELS.includes(waterLevelRaw)) {
      throw new HttpError(400, 'Invalid water level (expected FULL, HALF or EMPTY)')
    }

    const noteRaw = ((form.get('note') as string | null) ?? '').trim()
    if (noteRaw.length > 500) {
      throw new HttpError(400, 'Note must be 500 characters or fewer')
    }

    // Photo is optional — store it before recording the turn.
    let proofPath: string | null = null
    if (photo) {
      const photoBuffer = Buffer.from(await photo.arrayBuffer())
      const filename = `rotation-${Date.now()}.jpg`
      proofPath = await s3Upload(`proofs/${filename}`, photoBuffer, photo.type)
    }

    const { turnId } = await recordTurnAndAdvance({
      queue,
      turnUserId: onDuty.userId, // the turn belongs to the on-duty user, not the actor
      status: 'DONE',
      proofPath,
      waterLevel: waterLevelRaw || null,
      note: noteRaw || null,
    })

    // Fresh DTO reflects the NEW on-duty person (client toasts "Next up").
    const fresh = await reloadQueue(id)
    return Response.json({
      turn: { id: turnId, status: 'DONE' },
      queue: await buildQueueDTO(fresh, user.id),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
