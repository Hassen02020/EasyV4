"use client"

/**
 * SupplierStatusButton — SUPPLIER-STATUS-CHECK-01.
 *
 * Bouton « Vérifier chez le fournisseur » (super_admin, réservation hôtel
 * Tunisie avec référence myGo). Lecture seule : affiche l'état réel de la
 * réservation chez myGo, sans rien modifier. Le contrôle d'accès réel est
 * fait côté serveur (checkSupplierBookingStatusCore).
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, SearchCheck } from "lucide-react"
import { checkSupplierBookingStatus } from "@/lib/admin/supplier-status-actions"
import type { SupplierStatusResult } from "@/lib/admin/supplier-status-core"

const STATE_LABELS: Record<string, string> = {
  Validated: "Confirmée",
  Cancelled: "Annulée",
  OnRequest: "Sur demande",
}

interface Props {
  reservationId: string
}

export function SupplierStatusButton({ reservationId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SupplierStatusResult | null>(null)

  async function handleCheck() {
    setLoading(true)
    setResult(null)
    try {
      setResult(await checkSupplierBookingStatus(reservationId))
    } catch {
      setResult({
        ok: false,
        code: "SUPPLIER_UNREACHABLE",
        error: "Erreur inattendue lors de la vérification.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleCheck}
        disabled={loading}
        variant="outline"
        size="sm"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <SearchCheck className="mr-2 h-4 w-4" />
        )}
        {loading ? "Vérification en cours…" : "Vérifier chez le fournisseur"}
      </Button>

      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result && result.ok && !result.found && (
        <Alert variant="destructive">
          <AlertDescription>
            Réservation {result.supplierBookingRef} introuvable chez myGo.
          </AlertDescription>
        </Alert>
      )}

      {result && result.ok && result.found && (
        <Alert>
          <AlertDescription>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="font-medium">Réf. myGo</dt>
              <dd>{result.status.supplierBookingRef}</dd>
              <dt className="font-medium">État</dt>
              <dd>
                {result.status.state
                  ? (STATE_LABELS[result.status.state] ?? result.status.state)
                  : "non renseigné"}
              </dd>
              <dt className="font-medium">Créée</dt>
              <dd>{result.status.createdAt ?? "—"}</dd>
              <dt className="font-medium">Validée</dt>
              <dd>{result.status.validatedAt ?? "—"}</dd>
              <dt className="font-medium">Annulée</dt>
              <dd>{result.status.cancelledAt ?? "—"}</dd>
              <dt className="font-medium">Montant</dt>
              <dd>
                {result.status.totalPrice ?? "—"} {result.status.currency ?? ""}
              </dd>
              <dt className="font-medium">Frais</dt>
              <dd>
                {result.status.fee ?? "—"} {result.status.currency ?? ""}
              </dd>
              <dt className="font-medium">Hôtel / séjour</dt>
              <dd>
                {result.status.hotelName ?? "—"} ({result.status.checkIn ?? "?"}{" "}
                → {result.status.checkOut ?? "?"})
              </dd>
            </dl>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
