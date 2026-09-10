"use client"

import { useState } from "react"
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
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog"
import { MoreHorizontal } from "lucide-react"
import { setPlatformUserStatus } from "@/lib/admin/users-actions"

interface UserRowActionsProps {
  userId: string
  displayName: string
  status: "active" | "suspended"
}

/**
 * Menu d'actions pour une ligne de app/admin/users. Suspendre/Réactiver
 * appellent `setPlatformUserStatus` (vue cross-agence, distincte de
 * `setUserStatus` utilisé par /admin/staff qui reste scopé à une seule
 * agence) — protégé par confirmation et par les garde-fous serveur
 * (super_admin uniquement, jamais s'auto-suspendre, jamais suspendre le
 * dernier super_admin actif de la plateforme).
 * "Modifier"/"Changer le rôle" restent désactivés — hors périmètre.
 */
export function UserRowActions({
  userId,
  displayName,
  status,
}: UserRowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isActive = status === "active"

  async function handleConfirmed() {
    const next = isActive ? "suspended" : "active"
    const res = await setPlatformUserStatus({ userId, status: next })
    if (res.ok) {
      toast.success(next === "active" ? "Utilisateur réactivé" : "Utilisateur suspendu")
    } else {
      toast.error(res.error)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions pour ${displayName}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem disabled title="Pas encore disponible">
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Pas encore disponible">
            Changer le rôle
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={isActive ? "text-destructive" : "text-success"}
            onSelect={(e) => {
              e.preventDefault()
              setConfirmOpen(true)
            }}
          >
            {isActive ? "Suspendre" : "Réactiver"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant={isActive ? "destructive" : "default"}
        title={isActive ? "Suspendre cet utilisateur ?" : "Réactiver cet utilisateur ?"}
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
        onConfirm={handleConfirmed}
      />
    </>
  )
}
