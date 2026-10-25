"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import {
  rejectCustomerTopUp,
  validateCustomerTopUp,
} from "@/lib/finance/b2c-topup-review-actions"

interface Props {
  requestId: string
  amount: string
  customerLabel: string
  methodLabel: string
}

/** Valider / rejeter une recharge B2C manuelle. Aucun identifiant de
 * validateur n'est transmis : le serveur le lit dans la session. */
export function CustomerTopupReviewActions({
  requestId,
  amount,
  customerLabel,
  methodLabel,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function handleValidate() {
    setError(null)
    startTransition(async () => {
      const result = await validateCustomerTopUp(requestId)
      if (!result.ok) setError(result.error)
      else setConfirmOpen(false)
    })
  }

  function handleReject() {
    if (reason.trim().length < 3) {
      setError("Le motif du rejet est obligatoire (3 caractères minimum).")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await rejectCustomerTopUp(requestId, reason.trim())
      if (!result.ok) setError(result.error)
      else setRejectOpen(false)
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && !confirmOpen && !rejectOpen && (
        <span className="text-xs text-red-500">{error}</span>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={isPending} className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Valider
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la réception</DialogTitle>
            <DialogDescription>
              Créditer {amount} DT sur le portefeuille de{" "}
              <strong>{customerLabel}</strong> ({methodLabel}). Validez
              uniquement après avoir constaté la réception réelle du paiement
              (relevé bancaire, D17, encaissement à l&apos;agence).
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button onClick={handleValidate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Paiement reçu — créditer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            className="gap-1"
          >
            <XCircle className="h-3 w-3" />
            Rejeter
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la recharge</DialogTitle>
            <DialogDescription>
              Rejeter la demande de {amount} DT de{" "}
              <strong>{customerLabel}</strong>. Le portefeuille ne sera pas
              crédité ; le motif est visible par le client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor={`reject-${requestId}`}
              className="text-sm font-medium"
            >
              Motif du rejet
            </label>
            <Input
              id={`reject-${requestId}`}
              maxLength={500}
              placeholder="Ex. : virement non reçu, montant différent…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
