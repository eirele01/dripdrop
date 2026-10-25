import { s3GetUrl } from '@/lib/s3'
import { requireUser, HttpError, errorResponse } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser()
    const { path: parts } = await params

    if (!Array.isArray(parts) || parts.length === 0) {
      throw new HttpError(400, 'Invalid file path')
    }
    for (const part of parts) {
      if (!part || part.includes('..') || part.startsWith('/') || part.startsWith('\\')) {
        throw new HttpError(400, 'Invalid file path')
      }
    }

    // If proofPath is already a full URL (e.g. migrated from Vercel Blob), redirect directly.
    const key = parts.join('/')
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return Response.redirect(key, 302)
    }

    // Generate a time-limited presigned URL from S3 and redirect the client to it.
    const presignedUrl = await s3GetUrl(key, 900) // 15 minutes
    return Response.redirect(presignedUrl, 302)
  } catch (e) {
    return errorResponse(e)
  }
}
