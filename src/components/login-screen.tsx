'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api-client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SessionUser } from '@/lib/types'

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user } = await api.login(email.trim().toLowerCase(), password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}! 💧`)
      onLoggedIn(user)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-cyan-100 via-background to-background px-4 py-8 dark:from-cyan-950 dark:via-background">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          { }
          <img
            src="/mascot.png"
            alt="DripDrop mascot"
            className="h-28 w-28 animate-droplet-float rounded-3xl object-cover shadow-lg shadow-cyan-200/60 dark:shadow-cyan-900/40"
          />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">DripDrop</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dispenser duty, minus the group-chat chaos 💧
            </p>
          </div>
        </div>

        <Card className="rounded-3xl shadow-xl shadow-cyan-100/60 dark:shadow-none">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4" aria-label="Sign in">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@team.app"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="h-13 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/25"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No public signup — your team admin invites you 💌
        </p>
      </div>
    </div>
  )
}
