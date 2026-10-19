"use client"

/**
 * ConfirmMutuelleInvoiceSettlementButton — MUTUELLE-INVOICE-SETTLEMENT-01.
 *
 * Transition explicite "issued" → "paid" d'une facture Mutuelle, sur
 * preuve de règlement réel (référence du virement groupé périodique de la
 * mutuelle). Patron repris de ConfirmManualFlightButton — dialog, saisie
 * de référence obligatoire, appel server action, refresh sur succès.
 *
 * Visible uniquement pour une facture status="issued" (voir appelant).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, BadgeCheck } from "lucide-react"
import { confirmMutuelleInvoiceSettlement } from "@/lib/finance/mutuelle-invoice-settlement-actions"

interface Props {
  invoiceId: string
  invoiceNumber: string
}

export function ConfirmMutuelleInvoiceSettlementButton({
  invoiceId,
  invoiceNumber,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState("")

  async function handleConfirm() {
    if (!reference.trim() || reference.trim().length < 3) {
      setError(
        "La référence du règlement est obligatoire (ex. référence du virement groupé).",
      )
      return
    }

    setLoading(true)
    setError(null)
    try {
      const r = await confirmMutuelleInvoiceSettlement({
        invoiceId,
        reference: reference.trim(),
      })
      if (r.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(r.error)
      }
    } catch {
      setError("Erreur inattendue lors de la confirmation du règlement.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BadgeCheck className="mr-2 h-4 w-4" />
          Confirmer le règlement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer le règlement — {invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            À utiliser uniquement après réception effective du règlement
            (virement groupé périodique de la mutuelle). Ne confirmez pas sur
            une simple attente de paiement.
          </p>

          <div className="space-y-1">
            <Label htmlFor="reference">Référence du règlement *</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. référence virement groupé"
              disabled={loading}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Confirmation…" : "Confirmer le règlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
