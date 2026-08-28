"use client"

/**
 * Wrapper client pour la liste de réservations de `/compte` — seul endroit
 * où `BookingCard` reçoit `onCancel` (voir sa doc : `/bookings`, lookup
 * anonyme, ne le fournit jamais). Après une annulation réussie,
 * `router.refresh()` refait passer par `listMyReservations()` côté serveur
 * — la card affiche alors le statut "cancelled" réel, jamais une mise à
 * jour optimiste locale qui pourrait diverger du serveur.
 */

import { useRouter } from "next/navigation"
import { BookingCard } from "@/components/booking-summary-card"
import { cancelMyHotelReservation } from "@/lib/booking/customer-cancel-actions"
import type { BookingSummary } from "@/lib/booking/summary-types"

export function CompteReservationList({ bookings }: { bookings: BookingSummary[] }) {
  const router = useRouter()

  async function handleCancel(bookingId: string) {
    const result = await cancelMyHotelReservation(bookingId)
    if (result.ok) {
      router.refresh()
      return { ok: true }
    }
    return { ok: false, error: result.error }
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingCard key={booking.id} booking={booking} onCancel={handleCancel} />
      ))}
    </div>
  )
}
