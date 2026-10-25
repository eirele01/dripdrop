'use client'

import { useState } from 'react'
import { DashboardScreen } from '@/components/admin/dashboard-screen'
import { TasksScreen } from '@/components/admin/tasks-screen'
import { SchedulesScreen } from '@/components/admin/schedules-screen'
import { DispensersScreen } from '@/components/admin/dispensers-screen'
import { MembersScreen } from '@/components/admin/members-screen'
import { AdminRotationScreen } from '@/components/admin/rotation-screen'
import { UserAvatar } from '@/components/shared/status-badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  ClipboardList,
  Droplets,
  Ellipsis,
  LayoutDashboard,
  LogOut,
  Moon,
  Repeat,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SessionUser } from '@/lib/types'

type Tab = 'dashboard' | 'tasks' | 'schedules' | 'rotation' | 'dispensers' | 'members'

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; mobile?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList, mobile: true },
  { id: 'schedules', label: 'Schedules', icon: CalendarDays, mobile: true },
  { id: 'rotation', label: 'Rotation', icon: Repeat },
  { id: 'dispensers', label: 'Dispensers', icon: Droplets },
  { id: 'members', label: 'Members', icon: Users },
]

export function AdminShell({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [moreOpen, setMoreOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  async function signOut() {
    try {
      const { api } = await import('@/lib/api-client')
      await api.logout()
      onSignOut()
    } catch {
      toast.error('Could not sign out')
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2.5 px-2 py-2">
        { }
        <img src="/mascot.png" alt="DripDrop" className="h-9 w-9 rounded-xl object-cover" />
        <span className="text-lg font-extrabold tracking-tight">DripDrop</span>
      </div>
      {NAV.map((n) => {
        const Icon = n.icon
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => setTab(n.id)}
            aria-current={tab === n.id ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              tab === n.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden />
            {n.label}
          </button>
        )
      })}
      <div className="mt-auto">
        <Separator className="mb-3" />
        <div className="mb-1 flex items-center justify-between rounded-xl px-2 py-1.5">
          <Label htmlFor="side-dark" className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
            {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            Dark mode
          </Label>
          <Switch
            id="side-dark"
            checked={theme === 'dark'}
            onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
          />
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <UserAvatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">Admin</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-cyan-50/60 via-background to-background dark:from-cyan-950/20">
      {/* Desktop sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card/60 backdrop-blur lg:block"
        aria-label="Admin navigation"
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center gap-2.5 border-b bg-card/85 px-4 py-2.5 backdrop-blur-lg lg:hidden">
          { }
          <img src="/mascot.png" alt="DripDrop" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-lg font-extrabold tracking-tight">DripDrop</span>
          <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
            👑 Admin
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
          {tab === 'dashboard' && <DashboardScreen user={user} />}
          {tab === 'tasks' && <TasksScreen />}
          {tab === 'schedules' && <SchedulesScreen />}
          {tab === 'rotation' && <AdminRotationScreen />}
          {tab === 'dispensers' && <DispensersScreen />}
          {tab === 'members' && <MembersScreen me={user} />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Admin navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.filter((n) => n.mobile).map((n) => {
            const Icon = n.icon
            const active = tab === n.id
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setTab(n.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {n.label}
                {active && <span className="absolute bottom-0 h-1 w-10 rounded-full bg-primary" aria-hidden />}
              </button>
            )
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                  (tab === 'dispensers' || tab === 'members' || tab === 'rotation') ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Ellipsis className="h-5 w-5" aria-hidden />
                More
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
              <SheetHeader className="text-left">
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="space-y-1 px-4 pb-4">
                {NAV.filter((n) => !n.mobile).map((n) => {
                  const Icon = n.icon
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setTab(n.id)
                        setMoreOpen(false)
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-accent"
                    >
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                      {n.label}
                    </button>
                  )
                })}
                <Separator className="my-2" />
                <div className="flex min-h-[48px] items-center justify-between rounded-xl px-3">
                  <Label htmlFor="more-dark" className="flex items-center gap-3 text-sm font-medium">
                    <Moon className="h-5 w-5 text-primary" /> Dark mode
                  </Label>
                  <Switch
                    id="more-dark"
                    checked={theme === 'dark'}
                    onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                  />
                </div>
                <Separator className="my-2" />
                <div className="flex items-center gap-3 px-3 py-2">
                  <UserAvatar name={user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-10 gap-1.5 rounded-xl"
                    onClick={signOut}
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}
