"use client"

/**
 * Bouton "Vérifier le règlement" — file d'attente Paiements en attente.
 *
 * Volontairement PAS un simple "Confirmer" : ouvre un dialogue exigeant une
 * référence de règlement avant d'appeler `verifyManualPayment` (référence
 * obligatoire, tracée dans `payments.pspTransactionId` + `auditEvents`) —
 * le staff ne peut pas confirmer sans laisser de trace financière.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
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
import { verifyManualPayment } from "@/lib/finance/manual-payment-actions"

export function VerifyPaymentButton({
  reservationId,
  defaultMethod,
  remainingTnd,
  disabled,
}: {
  reservationId: string
  defaultMethod: "cash" | "transfer"
  /** Solde restant affiché à titre indicatif — le serveur revalide le montant, jamais confiance au client. */
  remainingTnd: number
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reference, setReference] = useState("")
  const [amount, setAmount] = useState(() => remainingTnd.toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const amountTnd = Number.parseFloat(amount)
  const amountValid = Number.isFinite(amountTnd) && amountTnd > 0

  function handleVerify() {
    setError(null)
    startTransition(async () => {
      const result = await verifyManualPayment({ reservationId, method: defaultMethod, reference, amountTnd })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          Vérifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vérifier le règlement</DialogTitle>
          <DialogDescription>
            Confirme la réservation, génère la facture et déclenche le voucher — uniquement après
            enregistrement d&apos;une référence de règlement réelle.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Montant encaissé (DT) — solde restant : {remainingTnd.toFixed(2)} DT</Label>
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={remainingTnd}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-reference">Référence du règlement</Label>
          <Input
            id="payment-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° bordereau, référence virement…"
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
            onClick={handleVerify}
            disabled={isPending || reference.trim().length === 0 || !amountValid}
            className="gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmer le règlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
