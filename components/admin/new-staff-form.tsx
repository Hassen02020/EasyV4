"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createStaffUser } from "@/lib/admin/users-actions"
import { ADMIN_ROLES, type AdminRole } from "@/lib/auth/admin-gate"

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  agent_resa: "Agent Réservation",
  agent_compta: "Agent Comptabilité",
  agent_excursions: "Agent Excursions",
}

export function NewStaffForm({ canGrantSuperAdmin }: { canGrantSuperAdmin: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<AdminRole>("agent_resa")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const assignableRoles = ADMIN_ROLES.filter((r) => r !== "super_admin" || canGrantSuperAdmin)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createStaffUser({ email, name, role })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Invitation envoyée à ${email}.`)
      router.push("/admin/staff")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="staff-name">Nom complet</Label>
        <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-email">Email</Label>
        <Input
          id="staff-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          Un email d&apos;invitation Supabase sera envoyé pour la création du mot de passe.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-role">Rôle</Label>
        <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
          <SelectTrigger id="staff-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assignableRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Envoyer l&apos;invitation
      </Button>
    </form>
  )
}
