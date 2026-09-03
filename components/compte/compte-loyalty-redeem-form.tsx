"use client"

/**
 * Easy2Book Rewards (Phase 38E) — formulaire de rédemption client. Le
 * serveur reste la seule autorité : ce formulaire n'affiche que des
 * plafonds INDICATIFS (10% arrondi ici pour l'UX) — `redeemMyLoyaltyPoints`
 * recalcule tout (montant éligible, plafond, solde) côté serveur avant
 * d'écrire quoi que ce soit ; un refus serveur reste possible même si ces
 * indications locales semblaient l'autoriser (ex. remboursement partiel
 * survenu entre-temps).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { redeemMyLoyaltyPoints } from "@/app/actions/redeem-my-loyalty-points"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const MIN_REDEMPTION_POINTS = 1000

export function CompteLoyaltyRedeemForm({
  availablePoints,
  reservations,
}: {
  availablePoints: number
  reservations: { id: string; publicRef: string; module: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reservationId, setReservationId] = useState(reservations[0]?.id ?? "")
  const [points, setPoints] = useState(String(Math.min(MIN_REDEMPTION_POINTS, availablePoints)))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (availablePoints < MIN_REDEMPTION_POINTS || reservations.length === 0) {
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const parsedPoints = Number.parseInt(points, 10)
    if (!Number.isFinite(parsedPoints) || parsedPoints <= 0) {
      setError("Nombre de points invalide.")
      return
    }
    if (!reservationId) {
      setError("Sélectionnez une réservation.")
      return
    }
    setPending(true)
    try {
      const result = await redeemMyLoyaltyPoints({
        reservationId,
        points: parsedPoints,
        idempotencyKey: crypto.randomUUID(),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(`${result.points} points utilisés (≈ ${result.tndEquivalent.toFixed(2)} DT).`)
      router.refresh()
    } catch {
      setError("Erreur technique. Veuillez réessayer.")
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary mt-2 text-xs font-medium hover:underline"
      >
        Utiliser mes points
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={reservationId}
          onChange={(e) => setReservationId(e.target.value)}
          disabled={pending}
          className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
        >
          {reservations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.publicRef}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={MIN_REDEMPTION_POINTS}
          max={availablePoints}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          disabled={pending}
          className="h-8 w-28 text-xs"
        />
        <Button type="submit" size="sm" disabled={pending} className="h-8 text-xs">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmer"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-muted-foreground text-xs hover:underline"
        >
          Annuler
        </button>
      </div>
      <p className="text-muted-foreground text-[11px]">
        Minimum {MIN_REDEMPTION_POINTS} points — plafond réel recalculé par le serveur (10% du montant éligible de la réservation choisie).
      </p>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {success && <p className="text-xs text-emerald-600">{success}</p>}
    </form>
  )
}
