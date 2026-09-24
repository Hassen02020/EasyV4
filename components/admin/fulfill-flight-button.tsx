"use client"

/**
 * FulfillFlightButton — admin action to drive a PENDING flight booking through
 * the full GDS lifecycle (recheck → book → issue → CONFIRMED).
 *
 * Renders only when:
 *  - module === "flight"
 *  - reservationStatus === "pending"  (maps to flight_bookings.status PENDING)
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Ticket } from "lucide-react"
import { fulfillFlightBooking } from "@/lib/vols/fulfillment-action"

interface Props {
  reservationId: string
}

export function FulfillFlightButton({ reservationId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ pnr?: string; error?: string } | null>(null)

  async function handleFulfill() {
    if (!confirm("Lancer le traitement GDS pour ce dossier ? (recheck prix → réservation → émission billet)")) return
    setLoading(true)
    setResult(null)
    try {
      const r = await fulfillFlightBooking(reservationId)
      if (r.ok) {
        setResult({ pnr: r.pnr })
        router.refresh()
      } else {
        setResult({ error: r.error })
      }
    } catch {
      setResult({ error: "Erreur inattendue lors du traitement." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleFulfill}
        disabled={loading}
        className="bg-sky-700 hover:bg-sky-800 text-white"
        size="sm"
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}
        {loading ? "Traitement GDS en cours…" : "Émettre le billet"}
      </Button>

      {result?.pnr && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertDescription className="text-green-800 dark:text-green-200">
            Billet émis — PNR : <strong>{result.pnr}</strong>
          </AlertDescription>
        </Alert>
      )}

      {result?.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
