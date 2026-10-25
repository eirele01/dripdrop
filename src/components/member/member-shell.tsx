'use client'

import { useState } from 'react'
import { TodayScreen } from '@/components/member/today-screen'
import { RotationScreen } from '@/components/member/rotation-screen'
import { HistoryScreen } from '@/components/member/history-screen'
import { ProfileScreen } from '@/components/member/profile-screen'
import { cn } from '@/lib/utils'
import { Droplets, History, Repeat, User } from 'lucide-react'
import type { SessionUser } from '@/lib/types'

type Tab = 'today' | 'rotation' | 'history' | 'profile'

const TABS: { id: Tab; label: string; icon: typeof Droplets }[] = [
  { id: 'today', label: 'Today', icon: Droplets },
  { id: 'rotation', label: 'Rotation', icon: Repeat },
  { id: 'history', label: 'History', icon: History },
  { id: 'profile', label: 'Profile', icon: User },
]

export function MemberShell({
  user,
  pendingRefillId,
  onSignOut,
}: {
  user: SessionUser
  pendingRefillId: string | null
  onSignOut: () => void
}) {
  const [tab, setTab] = useState<Tab>('today')

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-cyan-50/70 via-background to-background dark:from-cyan-950/30">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-5">
        {tab === 'today' && (
          <TodayScreen
            user={user}
            pendingRefillId={pendingRefillId}
            onOpenRotation={() => setTab('rotation')}
          />
        )}
        {tab === 'rotation' && <RotationScreen user={user} />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'profile' && <ProfileScreen user={user} onSignOut={onSignOut} />}
      </main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} aria-hidden />
                {t.label}
                {active && <span className="absolute bottom-0 h-1 w-10 rounded-full bg-primary" aria-hidden />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
