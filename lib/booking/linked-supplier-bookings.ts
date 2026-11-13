/**
 * MYGO-RECONCILE-GUARD-01 — identifiants myGo DÉJÀ rattachés à une réservation
 * locale. La réconciliation après réponse perdue ne doit jamais adopter la
 * réservation fournisseur d'un autre client : sans cette exclusion, si la
 * réservation de B n'a pas été créée chez myGo, B adopterait celle de A
 * (même hôtel, mêmes dates, créée depuis moins de 10 minutes).
 *
 * Lecture dans un contexte système : la vérification est volontairement
 * inter-agences (un identifiant fournisseur ne doit appartenir qu'à une seule
 * réservation, quel que soit le tenant). Un échec de lecture LÈVE : les
 * appelants le traitent comme « état toujours incertain » (jamais d'adoption).
 */
import { inArray } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservationHotel } from "@/lib/db/schema"

export async function findLinkedMyGoBookingIds(
  bookingIds: ReadonlyArray<number>,
): Promise<Set<number>> {
  const ids = [...new Set(bookingIds.filter((n) => Number.isFinite(n)))]
  if (ids.length === 0) return new Set()
  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: reservationHotel.providerBookingId })
      .from(reservationHotel)
      .where(
        inArray(
          reservationHotel.providerBookingId,
          ids.map((n) => String(n)),
        ),
      ),
  )
  return new Set(
    rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n)),
  )
}
