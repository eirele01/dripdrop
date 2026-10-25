'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { LeaderboardCard } from '@/components/shared/leaderboard-card'
import { UserAvatar } from '@/components/shared/status-badge'
import { useTheme } from 'next-themes'
import { Moon, LogOut, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import type { SessionUser } from '@/lib/types'

export function ProfileScreen({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const { theme, setTheme } = useTheme()
  const { data: stats, isLoading } = useQuery({ queryKey: ['myStats'], queryFn: api.myStats })
  const { data: board } = useQuery({ queryKey: ['leaderboard'], queryFn: api.leaderboard })

  async function signOut() {
    try {
      await api.logout()
      onSignOut()
    } catch {
      toast.error('Could not sign out')
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Profile</h1>
      </header>

      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-4 p-5">
          <UserAvatar name={user.name} className="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {user.role === 'ADMIN' ? '👑 Admin' : '🧑‍🔧 Member'}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isLoading || !stats ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (
          <>
            <StatCard emoji="💧" value={stats.doneCount} label="Total refills" />
            <StatCard emoji="🔥" value={stats.streak} label="Day streak" />
            <StatCard emoji="📅" value={stats.weekCount} label="This week" />
            <StatCard emoji={stats.rank === 1 ? '🥇' : '🏆'} value={`#${stats.rank}`} label="Team rank" />
          </>
        )}
      </div>

      <LeaderboardCard entries={board?.leaderboard ?? []} highlightUserId={user.id} />

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode" className="flex items-center gap-2 text-sm font-medium">
              <Moon className="h-4 w-4" /> Dark mode
            </Label>
            <Switch
              id="dark-mode"
              checked={theme === 'dark'}
              onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
            />
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              💡 Install DripDrop to your home screen for an app-like experience.
            </p>
            <Button variant="destructive" size="sm" className="h-10 shrink-0 gap-1.5 rounded-xl" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1 pb-2 text-center text-xs text-muted-foreground">
        <Trophy className="h-3 w-3" /> DripDrop · dispenser duty, done right
      </p>
    </div>
  )
}

function StatCard({ emoji, value, label }: { emoji: string; value: number | string; label: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 text-center">
        <p className="text-xl" aria-hidden>
          {emoji}
        </p>
        <p className="mt-0.5 text-2xl font-extrabold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
