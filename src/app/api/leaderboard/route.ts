import { requireUser, errorResponse } from '@/lib/auth'
import { leaderboardTop10 } from '@/lib/leaderboard'

export async function GET() {
  try {
    await requireUser()
    const leaderboard = await leaderboardTop10()
    return Response.json({ leaderboard })
  } catch (e) {
    return errorResponse(e)
  }
}
