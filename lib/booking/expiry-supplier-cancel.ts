/**
 * EXPIRY-SUPPLIER-CANCEL-01 — quand une réservation hôtel expire faute de
 * paiement, annuler la réservation chez le fournisseur (myGo).
 *
 * Constat (audit 2026-11-08/09) : /api/cron/expire-pending-payments passait la
 * réservation en `expired` sans jamais libérer la chambre chez myGo, alors
 * que la réservation myGo est confirmée DÈS la création (avant paiement
 * virement/espèces/dépôt, fenêtre de 24 h). TG-2026-000002 (myGo 500057) et
 * TG-2026-000003 (myGo 500230) : annulées par myGo lui-même, sans frais,
 * ~29 h et ~35 h après création (vérifié par SUPPLIER-STATUS-CHECK-01) — un
 * comportement fournisseur non garanti sur lequel on ne doit pas reposer.
 *
 * Règles :
 *  - seules les réservations que le cron VIENT de passer en `expired` sont
 *    traitées (jamais une réservation payée ou encore en attente) ;
 *  - module `hotel` avec une référence myGo numérique uniquement ;
 *  - compte myGo de l'agence de la réservation, même résolution que le
 *    parcours invité qui a créé la réservation (seul parcours qui pose
 *    `payment_expires_at`) ;
 *  - une réservation à la fois ; l'échec de l'une n'empêche pas les autres ;
 *  - l'expiration côté Easy2Book n'est JAMAIS annulée par un échec fournisseur ;
 *  - succès → trace `supplier.expiry_cancelled` ; échec → trace durable
 *    `supplier.compensation_failed` (SUPPLIER-INCIDENT-TRACE-01).
 */
import { inArray, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents, reservationHotel, reservations } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { recordSupplierIncident } from "@/lib/booking/supplier-incident"

/** audit_events.action est varchar(32). */
export const EXPIRY_CANCEL_AUDIT_ACTION = "supplier.expiry_cancelled"

export interface ExpiryCancelClient {
  cancelBooking(input: {
    bookingId: number
  }): Promise<{ bookingId: number; fee: number; currency: string }>
}

export type ResolveExpiryClient = (
  agencyId: string,
) => Promise<ExpiryCancelClient>

export interface ExpirySupplierCancelSummary {
  attempted: number
  cancelled: number
  failed: number
}

export async function cancelSupplierBookingsForExpired(
  expiredReservationIds: string[],
  resolveClient: ResolveExpiryClient,
): Promise<ExpirySupplierCancelSummary> {
  const summary: ExpirySupplierCancelSummary = {
    attempted: 0,
    cancelled: 0,
    failed: 0,
  }
  if (expiredReservationIds.length === 0) return summary

  const rows = await withSystemContext((tx) =>
    tx
      .select({
        id: reservations.id,
        agencyId: reservations.agencyId,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        providerBookingId: reservationHotel.providerBookingId,
        checkIn: reservationHotel.checkIn,
        checkOut: reservationHotel.checkOut,
        hotelId: reservationHotel.hotelId,
      })
      .from(reservations)
      .innerJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
      .where(inArray(reservations.id, expiredReservationIds)),
  )

  for (const row of rows) {
    const ref = row.providerBookingId?.trim() ?? ""
    if (
      row.module !== "hotel" ||
      row.status !== "expired" ||
      !/^\d+$/.test(ref)
    )
      continue
    summary.attempted++
    try {
      const client = await resolveClient(row.agencyId)
      const result = await client.cancelBooking({ bookingId: Number(ref) })
      summary.cancelled++
      try {
        await withSystemContext((tx) =>
          tx.insert(auditEvents).values({
            agencyId: row.agencyId,
            entityType: "reservation",
            entityId: row.id,
            action: EXPIRY_CANCEL_AUDIT_ACTION,
            diff: {
              publicRef: row.publicRef,
              supplier: "mygo",
              supplierBookingRef: ref,
              fee: result.fee,
              currency: result.currency,
              reason:
                "Paiement non reçu dans le délai — réservation expirée (EXPIRY-SUPPLIER-CANCEL-01).",
            },
          }),
        )
      } catch (err) {
        logger.error("[expiry-supplier-cancel] trace de succès impossible", {
          publicRef: row.publicRef,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    } catch (err) {
      summary.failed++
      await recordSupplierIncident({
        agencyId: row.agencyId,
        kind: "compensation_failed",
        supplier: "mygo",
        flow: "hotel_expiry",
        step: "payment_expired",
        supplierBookingRef: ref,
        hotelId: row.hotelId,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        error: err,
      })
    }
  }
  return summary
}
