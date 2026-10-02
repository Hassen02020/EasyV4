"use client"

/**
 * ConfirmManualFlightButton — PROVIDER-CONNECTIVITY-BRIDGE (P3/P4).
 *
 * Chemin B2B_OFFLINE : le staff a déjà vérifié la disponibilité/le prix hors
 * plateforme (portail B2B fournisseur, téléphone, email professionnel) et
 * saisit ici la preuve minimale de confirmation. N'appelle jamais un
 * GdsAdapter — voir manual-confirmation-action.ts.
 *
 * Rendu à côté de FulfillFlightButton (même emplacement), jamais les deux en
 * même temps pour le même dossier tant que l'un des deux n'a pas gagné le CAS
 * côté serveur (les deux boutons peuvent être visibles simultanément si le
 * statut est éligible aux deux chemins ; un seul aboutira).
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
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ClipboardCheck } from "lucide-react"
import { confirmManualFlightBooking } from "@/lib/vols/manual-confirmation-action"

interface Props {
  reservationId: string
}

export function ConfirmManualFlightButton({ reservationId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierBookingRef, setSupplierBookingRef] = useState("")
  const [confirmedPrice, setConfirmedPrice] = useState("")
  const [confirmedCurrency, setConfirmedCurrency] = useState("TND")
  const [operatorNote, setOperatorNote] = useState("")

  async function handleConfirm() {
    const priceValue = Number(confirmedPrice.replace(",", "."))
    if (!supplierBookingRef.trim()) {
      setError("La référence de réservation fournisseur est obligatoire.")
      return
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError("Le prix validé fournisseur doit être un nombre positif.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const r = await confirmManualFlightBooking(reservationId, {
        supplierBookingRef: supplierBookingRef.trim(),
        confirmedPrice: priceValue,
        confirmedCurrency: confirmedCurrency.trim() || undefined,
        operatorNote: operatorNote.trim() || undefined,
      })
      if (r.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(r.error)
      }
    } catch {
      setError("Erreur inattendue lors de la confirmation manuelle.")
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
          <ClipboardCheck className="mr-2 h-4 w-4" />
          Confirmer manuellement (B2B)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Confirmation manuelle — réservation fournisseur B2B
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            À utiliser uniquement après confirmation réelle du fournisseur
            (portail B2B, téléphone, email professionnel). Ne cochez pas cette
            étape sur une simple disponibilité non vérifiée.
          </p>

          <div className="space-y-1">
            <Label htmlFor="supplierBookingRef">
              Référence réservation fournisseur *
            </Label>
            <Input
              id="supplierBookingRef"
              value={supplierBookingRef}
              onChange={(e) => setSupplierBookingRef(e.target.value)}
              placeholder="Ex. ABC123"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="confirmedPrice">Prix validé fournisseur *</Label>
              <Input
                id="confirmedPrice"
                inputMode="decimal"
                value={confirmedPrice}
                onChange={(e) => setConfirmedPrice(e.target.value)}
                placeholder="Ex. 450.000"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmedCurrency">Devise</Label>
              <Input
                id="confirmedCurrency"
                value={confirmedCurrency}
                onChange={(e) =>
                  setConfirmedCurrency(e.target.value.toUpperCase())
                }
                maxLength={3}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="operatorNote">Note (optionnel)</Label>
            <Textarea
              id="operatorNote"
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              placeholder="Contexte de la validation B2B (canal, interlocuteur…)"
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
            {loading ? "Confirmation…" : "Confirmer la réservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
