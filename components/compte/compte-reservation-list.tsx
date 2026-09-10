"use client"

/**
 * Wrapper client pour la liste de réservations de `/compte` — seul endroit
 * où `BookingCard` reçoit `onCancel` (voir sa doc : `/bookings`, lookup
 * anonyme, ne le fournit jamais). Après une annulation réussie,
 * `router.refresh()` refait passer par `listMyReservations()` côté serveur
 * — la card affiche alors le statut "cancelled" réel, jamais une mise à
 * jour optimiste locale qui pourrait diverger du serveur.
 *
 * Dispatch par module : hôtel → `cancelMyHotelReservation` (politique myGo
 * réelle) ; Omra/Package/Activity → `cancelMyPolicyReservation` (Policy
 * Engine, snapshot figé à la réservation). Deux mécanismes distincts,
 * jamais fusionnés (myGo ne connaît pas `cancellationPolicies` et
 * inversement) — voir chaque fichier d'action pour le détail.
 */

import { useRouter } from "next/navigation"
import { BookingCard } from "@/components/booking-summary-card"
import { cancelMyHotelReservation } from "@/lib/booking/customer-cancel-actions"
import { cancelMyPolicyReservation } from "@/lib/booking/policy-cancel-actions"
import { submitReview } from "@/app/actions/submit-review"
import type { BookingSummary } from "@/lib/booking/summary-types"

const POLICY_ENGINE_MODULES = ["omra", "package", "activity"]

export function CompteReservationList({ bookings }: { bookings: BookingSummary[] }) {
  const router = useRouter()

  async function handleCancel(bookingId: string, module: string) {
    if (POLICY_ENGINE_MODULES.includes(module)) {
      const result = await cancelMyPolicyReservation(bookingId)
      if (!result.ok) return { ok: false, error: result.error }
      if (!result.allowed) return { ok: false, error: result.reason }
      router.refresh()
      return { ok: true, messages: result.messages }
    }

    const result = await cancelMyHotelReservation(bookingId)
    if (result.ok) {
      router.refresh()
      return { ok: true }
    }
    return { ok: false, error: result.error }
  }

  async function handleReview(bookingId: string, rating: number, comment: string) {
    const result = await submitReview({ reservationId: bookingId, rating, comment: comment || undefined })
    if (!result.ok) return { ok: false, error: result.error }
    router.refresh()
    return { ok: true }
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <div key={booking.id} id={`reservation-${booking.id}`} className="scroll-mt-4">
          <BookingCard
            booking={booking}
            onCancel={(id) => handleCancel(id, booking.module)}
            onReview={handleReview}
          />
        </div>
      ))}
    </div>
  )
}
