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
import { MoreHorizontal, Edit, Eye, XCircle, CheckCircle2 } from "lucide-react"

interface StaffRowActionsProps {
  memberId: string
  displayName: string
  status: "active" | "suspended"
}

/**
 * Menu d'actions pour une ligne de app/admin/staff. Même remarque que
 * components/admin/user-row-actions.tsx : aucune Server Action de
 * suspension/réactivation n'existe encore pour le personnel — la
 * confirmation aboutit à un message explicite, pas à un appel silencieux.
 */
export function StaffRowActions({
  memberId,
  displayName,
  status,
}: StaffRowActionsProps) {
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
            <Link href={`/admin/staff/${memberId}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir profil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
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
        onConfirm={handleConfirmed}
      />
    </>
  )
}
