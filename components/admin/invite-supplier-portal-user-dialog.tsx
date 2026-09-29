"use client"

/**
 * NETWORK-01 — invitation réelle d'un utilisateur portail pour un nœud
 * fournisseur (owner/manager/staff). Même pattern que InviteAgentDialog.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { inviteSupplierPortalUser } from "@/lib/suppliers/portal-actions"

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner — accès total" },
  { value: "manager", label: "Manager — produits, dispos, bookings" },
  { value: "staff", label: "Staff — lecture + confirmation présence" },
] as const

export function InviteSupplierPortalUserDialog({ nodeId }: { nodeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>("staff")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await inviteSupplierPortalUser({
        nodeId,
        email,
        role: role as "owner" | "manager" | "staff",
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Invitation envoyée à ${email}.`)
      setOpen(false)
      setEmail("")
      setRole("staff")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Inviter un utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un utilisateur portail</DialogTitle>
          <DialogDescription>
            Un email d&apos;invitation Supabase sera envoyé pour la création du mot de passe.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="portal-user-email">Email</Label>
            <Input
              id="portal-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-user-role">Rôle</Label>
            <Select value={role} onValueChange={setRole} disabled={isPending}>
              <SelectTrigger id="portal-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
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
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Envoyer l&apos;invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
