'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { EmptyState } from '@/components/shared/empty-state'
import { UserAvatar } from '@/components/shared/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Copy, Loader2, Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { MemberDTO, SessionUser } from '@/lib/types'

export function MembersScreen({ me }: { me: SessionUser }) {
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [created, setCreated] = useState<MemberDTO | null>(null)
  const [createdPassword, setCreatedPassword] = useState('')
  const [editMember, setEditMember] = useState<MemberDTO | null>(null)
  const [deleteMemberId, setDeleteMemberId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['members'], queryFn: api.members })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateMember(id, { isActive }),
    onSuccess: () => {
      toast.success('Member updated')
      qc.invalidateQueries({ queryKey: ['members'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.updateMember(id, body),
    onSuccess: () => {
      toast.success('Member updated')
      qc.invalidateQueries({ queryKey: ['members'] })
      setEditMember(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteMember(id),
    onSuccess: () => {
      toast.success('Member deleted')
      qc.invalidateQueries({ queryKey: ['members'] })
      setDeleteMemberId(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Invite teammates — there&apos;s no public signup
          </p>
        </div>
        <Button className="h-11 gap-1.5 rounded-xl font-semibold" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" /> Invite member
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !data || data.members.length === 0 ? (
        <EmptyState emoji="👥" title="No members yet" subtitle="Invite your first teammate above." />
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="max-h-[60vh] overflow-y-auto p-0 scrollbar-thin">
            <ul className="divide-y" role="list">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                  <UserAvatar name={m.name} className="h-10 w-10 text-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-semibold">
                      {m.name}
                      {m.role === 'ADMIN' && (
                        <Badge className="rounded-full bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
                          Admin
                        </Badge>
                      )}
                      {!m.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-bold">{m.doneCount}</p>
                    <p className="text-[10px] text-muted-foreground">refills</p>
                  </div>
                  {m.id !== me.id && (
                    <div className="flex items-center gap-2">
                      <Switch
                        aria-label={m.isActive ? `Deactivate ${m.name}` : `Activate ${m.name}`}
                        checked={m.isActive}
                        onCheckedChange={(v) => toggle.mutate({ id: m.id, isActive: v })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Edit ${m.name}`}
                        onClick={() => setEditMember(m)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label={`Delete ${m.name}`}
                        onClick={() => setDeleteMemberId(m.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o)
          if (!o) setCreated(null)
        }}
        created={created}
        createdPassword={createdPassword}
        onCreated={(member, password) => {
          setCreated(member)
          setCreatedPassword(password)
          qc.invalidateQueries({ queryKey: ['members'] })
        }}
      />
      <EditMemberDialog
        key={editMember?.id}
        open={!!editMember}
        onOpenChange={(o) => setEditMember(o ? editMember : null)}
        member={editMember}
        onSave={(id, body) => edit.mutate({ id, body })}
        saving={edit.isPending}
      />
      <DeleteMemberDialog
        key={deleteMemberId}
        open={!!deleteMemberId}
        onOpenChange={(o) => setDeleteMemberId(o ? deleteMemberId : null)}
        memberId={deleteMemberId}
        onDelete={(id) => del.mutate(id)}
        deleting={del.isPending}
      />
    </div>
  )
}

function InviteDialog({
  open,
  onOpenChange,
  created,
  createdPassword,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  created: MemberDTO | null
  createdPassword: string
  onCreated: (member: MemberDTO, password: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [creating, setCreating] = useState(false)

  async function submit() {
    if (name.trim().length < 2) return toast.error('Name is too short')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('Enter a valid email')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    setCreating(true)
    try {
      const { member } = await api.inviteMember({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      })
      toast.success(`${member.name} invited ✨`)
      onCreated(member, password)
      setName('')
      setEmail('')
      setPassword('')
      setRole('MEMBER')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>🎉 {created.name} is in!</DialogTitle>
              <DialogDescription>
                Share these credentials — they can change nothing until they sign in (keep it simple:
                write it on a sticky note 📝).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-xl bg-muted/70 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-semibold">{created.email}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Password:</span>{' '}
                <code className="rounded bg-card px-2 py-0.5 font-bold">{createdPassword}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Copy password"
                  onClick={() => {
                    navigator.clipboard?.writeText(createdPassword)
                    toast.success('Password copied')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </p>
            </div>
            <DialogFooter>
              <Button className="h-11 rounded-xl px-6 font-bold" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>💌 Invite a member</DialogTitle>
              <DialogDescription>Create their account and share the password.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Full name</Label>
                <Input
                  id="inv-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jamie Park"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jamie@team.app"
                  className="h-11 rounded-xl"
                />
              </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-pass">Password</Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="inv-pass"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="min 6 chars"
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger aria-label="Role" className="rounded-xl w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">🧑‍🔧 Member</SelectItem>
                      <SelectItem value="ADMIN">👑 Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="h-11  rounded-xl px-6 font-bold shadow-md shadow-primary/20"
                onClick={submit}
                disabled={creating}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditMemberDialog({
  open,
  onOpenChange,
  member,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: MemberDTO | null
  onSave: (id: string, body: Record<string, unknown>) => void
  saving: boolean
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [role, setRole] = useState<string>(member?.role ?? 'MEMBER')
  const [password, setPassword] = useState('')

  async function submit() {
    if (!member) return
    if (name.trim().length < 2) return toast.error('Name is too short')
    if (password && password.length < 6) return toast.error('Password must be at least 6 characters')
    try {
      const body: Record<string, unknown> = { name: name.trim(), role }
      if (password) body.password = password
      onSave(member.id, body)
      setName('')
      setPassword('')
      setRole('MEMBER')
    } catch {
      // error handled by mutation onError
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>✏️ Edit member</DialogTitle>
          <DialogDescription>Update name, role, or reset password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role" className="rounded-xl w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">🧑‍🔧 Member</SelectItem>
                <SelectItem value="ADMIN">👑 Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-password">Reset password (optional)</Label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 chars"
              className="h-11 rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to keep current password.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl px-6 font-bold shadow-md shadow-primary/20"
            onClick={submit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteMemberDialog({
  open,
  onOpenChange,
  memberId,
  onDelete,
  deleting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string | null
  onDelete: (id: string) => void
  deleting: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete member?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the member and all their data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (memberId) onDelete(memberId)
              onOpenChange(false)
            }}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
