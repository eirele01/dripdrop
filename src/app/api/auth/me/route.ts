import { getAuthUser, HttpError, errorResponse } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) throw new HttpError(401, 'Not signed in')
    return Response.json({ user })
  } catch (e) {
    return errorResponse(e)
  }
}
