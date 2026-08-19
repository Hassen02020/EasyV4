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
import { MoreHorizontal, Eye, CheckCircle, XCircle } from "lucide-react"

interface ValidationRowActionsProps {
  reservationId: string
  publicRef: string
  canValidate: boolean
}

/**
 * Menu d'actions pour une ligne de app/admin/validations. Même remarque que
 * user-row-actions.tsx/staff-row-actions.tsx : aucune Server Action de
 * validation/rejet n'existe encore pour reservation_validations — la
 * confirmation aboutit à un message explicite, pas à un appel silencieux.
 */
export function ValidationRowActions({
  reservationId,
  publicRef,
  canValidate,
}: ValidationRowActionsProps) {
  const [confirmAction, setConfirmAction] = useState<"validate" | "reject" | null>(null)

  function handleConfirmed(action: "validate" | "reject") {
    toast.info(
      `Action "${action === "validate" ? "Valider" : "Rejeter"}" non encore reliée à une Server Action back-office — aucun changement n'a été effectué pour ${publicRef}.`,
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions pour la réservation ${publicRef}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/reservations/${reservationId}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>
          {canValidate && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-success"
                onSelect={(e) => {
                  e.preventDefault()
                  setConfirmAction("validate")
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Valider
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  setConfirmAction("reject")
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeter
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmAction === "validate"}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        variant="default"
        title="Valider cette réservation ?"
        description={
          <>
            La réservation <strong>{publicRef}</strong> passera à l&apos;étape
            suivante du workflow de validation.
          </>
        }
        confirmLabel="Valider"
        onConfirm={() => handleConfirmed("validate")}
      />

      <ConfirmActionDialog
        open={confirmAction === "reject"}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        variant="destructive"
        title="Rejeter cette réservation ?"
        description={
          <>
            La réservation <strong>{publicRef}</strong> sera marquée comme
            rejetée. Cette action peut nécessiter une intervention manuelle
            pour être annulée.
          </>
        }
        confirmLabel="Rejeter"
        onConfirm={() => handleConfirmed("reject")}
      />
    </>
  )
}
