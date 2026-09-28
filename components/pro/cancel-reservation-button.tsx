"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cancelHotelReservation } from "@/lib/booking/cancel-actions"
import { formatTND } from "@/lib/pro/format"

export function CancelReservationButton({
  reservationId,
  publicRef,
}: {
  reservationId: string
  publicRef: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)

  function handleConfirm() {
    startTransition(async () => {
      const result = await cancelHotelReservation(reservationId)
      setOpen(false)
      if (result.ok) {
        toast.success(
          result.refundedTnd > 0
            ? `Réservation annulée — ${formatTND(result.refundedTnd)} remboursé sur le wallet.`
            : "Réservation annulée (frais d'annulation myGo = montant total, aucun remboursement).",
        )
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="mr-2 h-4 w-4" />
          )}
          Annuler la réservation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la réservation {publicRef} ?</AlertDialogTitle>
          <AlertDialogDescription>
            L&apos;annulation sera transmise immédiatement à myGo. Des frais
            d&apos;annulation peuvent s&apos;appliquer selon la politique de
            l&apos;hôtel ; le solde restant (montant payé moins frais
            éventuels) sera automatiquement recrédité sur le wallet de
            l&apos;agence. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Retour</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Annulation en cours...
              </>
            ) : (
              "Confirmer l'annulation"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
