"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  MoreHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  Flag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  confirmOmraReservation,
  cancelOmraReservation,
  completeOmraReservation,
} from "@/lib/omra/reservation-actions"

interface Props {
  id: string
  publicRef: string
  status: string
  /** "menu" (liste) ou "buttons" (fiche détail). */
  variant?: "menu" | "buttons"
}

export function OmraReservationActions({
  id,
  publicRef,
  status,
  variant = "menu",
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState("")

  const canConfirm = status === "pending"
  const canCancel = status === "pending" || status === "confirmed"
  const canComplete = status === "confirmed"

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        toast.error(result.error ?? "Erreur inattendue.")
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  function handleConfirm() {
    run(() => confirmOmraReservation(id), `Réservation ${publicRef} confirmée.`)
  }

  function handleComplete() {
    run(
      () => completeOmraReservation(id),
      `Réservation ${publicRef} marquée complétée.`,
    )
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelOmraReservation(id, reason.trim() || undefined)
      if (!result.ok) {
        toast.error(result.error ?? "Erreur inattendue.")
        return
      }
      toast.success(`Réservation ${publicRef} annulée.`)
      setCancelOpen(false)
      setReason("")
      router.refresh()
    })
  }

  const cancelDialog = (
    <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la réservation {publicRef} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le statut passera à « Annulée » et les places seront restaurées dans
            le stock. Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cancel-reason-${id}`}>Motif (optionnel)</Label>
          <Textarea
            id={`cancel-reason-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. demande du client, dossier incomplet…"
            maxLength={500}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Retour</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleCancel()
            }}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isPending ? "Annulation…" : "Confirmer l'annulation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (variant === "buttons") {
    return (
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirmer
          </Button>
        )}
        {canComplete && (
          <Button
            onClick={handleComplete}
            disabled={isPending}
            variant="outline"
            className="text-blue-700"
          >
            <Flag className="mr-2 h-4 w-4" />
            Marquer complétée
          </Button>
        )}
        {canCancel && (
          <Button
            onClick={() => setCancelOpen(true)}
            disabled={isPending}
            variant="outline"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Annuler
          </Button>
        )}
        {cancelDialog}
      </div>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isPending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/omra/reservations/${id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir détails
            </Link>
          </DropdownMenuItem>
          {(canConfirm || canCancel || canComplete) && (
            <DropdownMenuSeparator />
          )}
          {canConfirm && (
            <DropdownMenuItem
              className="text-emerald-600"
              onSelect={(e) => {
                e.preventDefault()
                handleConfirm()
              }}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmer
            </DropdownMenuItem>
          )}
          {canComplete && (
            <DropdownMenuItem
              className="text-blue-700"
              onSelect={(e) => {
                e.preventDefault()
                handleComplete()
              }}
            >
              <Flag className="mr-2 h-4 w-4" />
              Marquer complétée
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem
              className="text-red-600"
              onSelect={(e) => {
                e.preventDefault()
                setCancelOpen(true)
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Annuler
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {cancelDialog}
    </>
  )
}
