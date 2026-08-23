"use client"

/**
 * Bouton "Rembourser" — expose `refundReservation` (lib/finance/refund-actions.ts,
 * Phase 16.2) dans une UI. Le backend valide déjà tout côté serveur
 * (rôle, montant <= capturé, idempotence des mises à jour) — ce composant
 * ne fait que collecter un motif obligatoire et un montant optionnel
 * (vide = remboursement total du solde encore remboursable).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { refundReservation } from "@/lib/finance/refund-actions"

export function RefundButton({
  reservationId,
  refundableTnd,
  disabled,
}: {
  reservationId: string
  /** Montant encore remboursable affiché à titre indicatif — le serveur revalide. */
  refundableTnd: number
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const amountTnd = amount.trim() === "" ? undefined : Number.parseFloat(amount)
  const amountValid = amountTnd === undefined || (Number.isFinite(amountTnd) && amountTnd > 0)

  function handleRefund() {
    setError(null)
    startTransition(async () => {
      const result = await refundReservation({ reservationId, reason, amountTnd })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setAmount("")
      setReason("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || refundableTnd <= 0} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Rembourser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rembourser la réservation</DialogTitle>
          <DialogDescription>
            Crédite le wallet client et trace l&apos;opération. Montant vide =
            remboursement total du solde encore remboursable ({refundableTnd.toFixed(2)} DT).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="refund-amount">
            Montant à rembourser (DT) — laisser vide pour tout ({refundableTnd.toFixed(2)} DT)
          </Label>
          <Input
            id="refund-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={refundableTnd}
            placeholder={refundableTnd.toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refund-reason">Motif du remboursement</Label>
          <Input
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Annulation client, geste commercial…"
            disabled={isPending}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            onClick={handleRefund}
            disabled={isPending || reason.trim().length === 0 || !amountValid}
            className="gap-2"
            variant="destructive"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Confirmer le remboursement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
