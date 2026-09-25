"use server"

/**
 * Réservation transfert B2C autonome (guest checkout).
 *
 * Chemin PARALLÈLE à createTransferBooking (lib/transfers/actions.ts) —
 * celui-ci reste intact pour le B2B. Même principe que le tunnel guest
 * existant (Omra, Activités, Hôtel, Package) :
 *   - agencyId résolu via getDefaultAgencyId() (agence OTA directe)
 *   - Aucun débit wallet (debitPartnerCredit est réservé aux comptes agence)
 *   - status "pending" + payment "pending" — règlement différé confirmé par
 *     l'équipe Easy2Book hors-ligne (virement ou espèces)
 *   - Prix 100% dérivé du serveur (calculateTransferPrice) ; aucune valeur
 *     fournie par le client n'est jamais utilisée comme base de facturation
 *   - guestAccessToken généré par DB (DEFAULT), retourné au client pour
 *     /booking/confirmation/[ref]?token=…
 */

import { eq, and, sql } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationTransfer,
  customers,
  auditEvents,
  catalogTransferZones,
  payments,
} from "@/lib/db/schema"
import { calculateTransferPrice } from "./pricing"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface GuestTransferBookingInput {
  fromZoneId: string
  toZoneId: string
  vehicleType: "sedan" | "van" | "minibus" | "bus" | "luxury"
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:MM
  flightNumber?: string
  flightArrivalAt?: string // ISO datetime
  pax: number
  luggageCount?: number
  customer: {
    firstName: string
    lastName: string
    phone: string
    email?: string
    civicId?: string
  }
}

export type CreateGuestTransferBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      totalTnd: number
    }
  | { ok: false; error: string; code?: string }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TR-${year}-`
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        sql`${reservations.publicRef} LIKE ${prefix + "%"}`,
      ),
    )
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}

/* -------------------------------------------------------------------------- */
/* Public Action                                                              */
/* -------------------------------------------------------------------------- */

export async function createGuestTransferBooking(
  input: GuestTransferBookingInput,
): Promise<CreateGuestTransferBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }
  if (input.pax <= 0 || input.pax > 50) {
    return { ok: false, error: "Nombre de passagers invalide (1-50)" }
  }

  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        fromZoneId: input.fromZoneId,
        toZoneId: input.toZoneId,
        vehicleType: input.vehicleType,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        phone: input.customer.phone,
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(input.customer.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestTransferBooking(input, linkedAuthUserId),
  )
}

/* -------------------------------------------------------------------------- */
/* Internal runner                                                            */
/* -------------------------------------------------------------------------- */

async function runCreateGuestTransferBooking(
  input: GuestTransferBookingInput,
  linkedAuthUserId: string | null,
): Promise<CreateGuestTransferBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
      code: "NO_AGENCY",
    }
  }

  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // 1. Prix 100% serveur — jamais fourni par le client
        const pricing = await calculateTransferPrice({
          fromZoneId: input.fromZoneId,
          toZoneId: input.toZoneId,
          vehicleType: input.vehicleType,
          pickupDate: input.pickupDate,
          pickupTime: input.pickupTime,
          agencyId,
        })
        if (!pricing) throw new Error("NO_PRICING")

        const totalTnd = pricing.totalTnd

        // 2. Noms des zones pour l'affichage
        const [fromZone] = await tx
          .select({ name: catalogTransferZones.name })
          .from(catalogTransferZones)
          .where(eq(catalogTransferZones.id, input.fromZoneId))
          .limit(1)
        const [toZone] = await tx
          .select({ name: catalogTransferZones.name })
          .from(catalogTransferZones)
          .where(eq(catalogTransferZones.id, input.toZoneId))
          .limit(1)

        const offerLabel = `${fromZone?.name ?? input.fromZoneId} → ${toZone?.name ?? input.toZoneId}`

        // 3. Client
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: "M",
            firstName: input.customer.firstName,
            lastName: input.customer.lastName,
            email: input.customer.email,
            phone: input.customer.phone,
            civicId: input.customer.civicId,
            civicIdType: input.customer.civicId ? "cin" : undefined,
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })

        // 4. Réservation générique — status "pending" (pas de débit wallet)
        const publicRef = await nextPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId: customer.id,
            publicRef,
            module: "transfer",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              fromZoneId: input.fromZoneId,
              toZoneId: input.toZoneId,
              fromZoneName: fromZone?.name,
              toZoneName: toZone?.name,
              vehicleType: input.vehicleType,
              pickupDate: input.pickupDate,
              pickupTime: input.pickupTime,
              pax: input.pax,
              luggageCount: input.luggageCount,
              flightNumber: input.flightNumber,
              flightArrivalAt: input.flightArrivalAt,
              pricing,
              // Champs lisibles par /booking/confirmation/[ref]
              offerLabel,
              startDate: input.pickupDate,
              channel: "b2c_guest",
              paymentMethod: "transfer",
            },
          })
          .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })

        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        // 5. Paiement en attente — règlement différé (virement / espèces)
        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: "transfer",
          originalCurrency: "TND",
          originalAmount: totalTnd.toFixed(2),
          tndAmount: totalTnd.toFixed(2),
          kind: "deposit",
          status: "pending",
        })

        // 6. Extension Transfer
        await tx.insert(reservationTransfer).values({
          reservationId,
          agencyId,
          pickupZoneId: input.fromZoneId,
          dropoffZoneId: input.toZoneId,
          pickupAddress: fromZone?.name,
          dropoffAddress: toZone?.name,
          flightNumber: input.flightNumber,
          flightArrivalAt: input.flightArrivalAt ? new Date(input.flightArrivalAt) : undefined,
          pax: input.pax,
          luggageCount: input.luggageCount ?? 0,
          vehicleType: input.vehicleType,
          statusTimeline: { created: { at: new Date().toISOString(), status: "created" } },
        })

        // 7. Audit
        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: "",
          entityType: "reservation",
          entityId: reservationId,
          action: "transfer_booking.created",
          diff: {
            fromZoneId: input.fromZoneId,
            toZoneId: input.toZoneId,
            vehicleType: input.vehicleType,
            pickupDate: input.pickupDate,
            pickupTime: input.pickupTime,
            pax: input.pax,
            totalTnd,
            publicRef,
            channel: "b2c_guest",
          },
        })

        return { reservationId, publicRef, guestAccessToken, totalTnd }
      },
    )

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      totalTnd: result.totalTnd,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      NO_PRICING: "Aucun tarif configuré pour cet itinéraire et ce véhicule",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
