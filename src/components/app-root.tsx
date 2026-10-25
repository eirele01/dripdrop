'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { LoginScreen } from '@/components/login-screen'
import { MemberShell } from '@/components/member/member-shell'
import { AdminShell } from '@/components/admin/admin-shell'
import type { SessionUser } from '@/lib/types'

export function AppRoot() {
  const qc = useQueryClient()

  const meQuery = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000, retry: false })

  // Derived session state — no mirroring effects needed.
  // undefined = still loading, null = signed out.
  const user: SessionUser | null | undefined = meQuery.isPending
    ? undefined
    : meQuery.data?.user ?? null

  // QR entry: /?refill=<dispenserId> — read once, lazily.
  const [pendingRefillId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('refill')
  })

  // Clean the QR param from the address bar (external system, no setState).
  useEffect(() => {
    if (!pendingRefillId) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('refill')) return
    url.searchParams.delete('refill')
    const qs = url.searchParams.toString()
    window.history.replaceState(null, '', url.pathname + (qs ? `?${qs}` : ''))
  }, [pendingRefillId])

  // Global 401 handling: flip back to login by updating the query cache.
  useEffect(() => {
    const onUnauthorized = () => {
      qc.setQueryData(['me'], { user: null })
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    }
    window.addEventListener('dd:unauthorized', onUnauthorized)
    return () => window.removeEventListener('dd:unauthorized', onUnauthorized)
  }, [qc])

  function handleSignOut() {
    qc.setQueryData(['me'], { user: null })
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-cyan-100 to-background dark:from-cyan-950">
        <img
          src="/mascot.png"
          alt="DripDrop loading"
          className="h-24 w-24 animate-droplet-float rounded-3xl object-cover shadow-lg"
        />
        <p className="text-sm font-medium text-muted-foreground">DripDrop is waking up…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onLoggedIn={(u) => {
          qc.setQueryData(['me'], { user: u })
          qc.invalidateQueries()
        }}
      />
    )
  }

  return user.role === 'ADMIN' ? (
    <AdminShell user={user} onSignOut={handleSignOut} />
  ) : (
    <MemberShell user={user} pendingRefillId={pendingRefillId} onSignOut={handleSignOut} />
  )
}
