'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UserAvatar } from '@/components/shared/status-badge'
import { Flame } from 'lucide-react'
import type { LeaderDTO } from '@/lib/types'

const MEDALS = ['🥇', '🥈', '🥉']

export function LeaderboardCard({
  entries,
  highlightUserId,
  className = '',
}: {
  entries: LeaderDTO[]
  highlightUserId?: string
  className?: string
}) {
  return (
    <Card className={`rounded-2xl ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          🏆 Refill leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">No refills yet 🫗</p>
        )}
        {entries.map((e, i) => (
          <div
            key={e.userId}
            className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${
              e.userId === highlightUserId ? 'bg-primary/10' : i % 2 === 0 ? 'bg-muted/50' : ''
            }`}
          >
            <span className="w-7 text-center text-lg" aria-hidden>
              {MEDALS[i] ?? <span className="text-sm font-semibold text-muted-foreground">#{i + 1}</span>}
            </span>
            <UserAvatar name={e.name} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {e.name}
              {e.userId === highlightUserId && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  YOU
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-0.5 font-semibold text-orange-500">
                <Flame className="h-3.5 w-3.5" aria-hidden /> {e.streak}
              </span>
              <span className="font-semibold text-foreground">{e.doneCount} refills</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
