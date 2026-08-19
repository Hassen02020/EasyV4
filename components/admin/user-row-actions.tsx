"use client"

import { useState } from "react"
import Link from "next/link"
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

interface UserRowActionsProps {
  userId: string
  displayName: string
  status: "active" | "suspended"
}

/**
 * Menu d'actions pour une ligne de app/admin/users. Suspendre/Réactiver
 * sont protégés par une boîte de confirmation (alert-dialog) — mais aucune
 * Server Action de suspension/réactivation n'existe encore côté back-office
 * pour les utilisateurs (contrairement aux agences/réservations) : la
 * confirmation aboutit donc à un message explicite plutôt qu'à un appel
 * silencieux vers une fonction qui n'existe pas. Cette page reste
 * strictement frontend pour cette session (aucune Server Action créée).
 */
export function UserRowActions({
  userId,
  displayName,
  status,
}: UserRowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isActive = status === "active"

  function handleConfirmed() {
    toast.info(
      `Action "${isActive ? "Suspendre" : "Réactiver"}" non encore reliée à une Server Action back-office — aucun changement n'a été effectué pour ${displayName}.`,
    )
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
          <DropdownMenuItem asChild>
            <Link href={`/admin/users/${userId}`}>Modifier</Link>
          </DropdownMenuItem>
          <DropdownMenuItem>Changer le rôle</DropdownMenuItem>
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
