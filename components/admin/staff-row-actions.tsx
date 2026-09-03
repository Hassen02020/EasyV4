"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
} from "@/components/ui/dialog"
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog"
import { MoreHorizontal, Eye, XCircle, CheckCircle2, Shield, Loader2 } from "lucide-react"
import { setUserStatus, setUserRole } from "@/lib/admin/users-actions"
import { ADMIN_ROLES, type AdminRole } from "@/lib/auth/admin-gate"

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  agent_resa: "Agent Réservation",
  agent_compta: "Agent Comptabilité",
  agent_excursions: "Agent Excursions",
}

interface StaffRowActionsProps {
  memberId: string
  displayName: string
  status: "active" | "suspended"
  role: string
  /** Le manager courant ne peut pas s'auto-modifier — désactive les actions sur sa propre ligne. */
  isSelf: boolean
}

export function StaffRowActions({
  memberId,
  displayName,
  status,
  role,
  isSelf,
}: StaffRowActionsProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [nextRole, setNextRole] = useState<AdminRole>(
    (ADMIN_ROLES as readonly string[]).includes(role) ? (role as AdminRole) : "agent_resa",
  )
  const [isPending, startTransition] = useTransition()
  const isActive = status === "active"

  function handleConfirmStatus() {
    startTransition(async () => {
      const result = await setUserStatus({
        userId: memberId,
        status: isActive ? "suspended" : "active",
      })
      setConfirmOpen(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(isActive ? `${displayName} suspendu.` : `${displayName} réactivé.`)
      router.refresh()
    })
  }

  function handleSaveRole() {
    startTransition(async () => {
      const result = await setUserRole({ userId: memberId, role: nextRole })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRoleDialogOpen(false)
      toast.success(`Rôle de ${displayName} mis à jour.`)
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions pour ${displayName}`}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem disabled title="Pas encore disponible">
            <Eye className="mr-2 h-4 w-4" />
            Voir profil
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isSelf}
            onSelect={(e) => {
              e.preventDefault()
              setRoleDialogOpen(true)
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            Modifier le rôle
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            className={isActive ? "text-destructive" : "text-success"}
            onSelect={(e) => {
              e.preventDefault()
              setConfirmOpen(true)
            }}
          >
            {isActive ? (
              <XCircle className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {isActive ? "Suspendre" : "Réactiver"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant={isActive ? "destructive" : "default"}
        title={isActive ? "Suspendre cet agent ?" : "Réactiver cet agent ?"}
        description={
          isActive ? (
            <>
              <strong>{displayName}</strong> ne pourra plus se connecter tant
              que son compte est suspendu. Cette action peut être annulée
              plus tard.
            </>
          ) : (
            <>
              <strong>{displayName}</strong> pourra de nouveau se connecter
              immédiatement.
            </>
          )
        }
        confirmLabel={isActive ? "Suspendre" : "Réactiver"}
        onConfirm={handleConfirmStatus}
      />

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle de {displayName}</DialogTitle>
            <DialogDescription>
              Le rôle détermine les pages et actions accessibles à cet agent dans le back-office.
            </DialogDescription>
          </DialogHeader>
          <Select value={nextRole} onValueChange={(v) => setNextRole(v as AdminRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={handleSaveRole} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
