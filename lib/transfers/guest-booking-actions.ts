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
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
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
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { resolveCheckoutPromoCore } from "@/lib/crm/promo-checkout-core"
import { applyPromoDiscountCore } from "@/lib/finance/promo-discount-core"

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
  /**
   * PRICING-PROMO-LINK-01 — INDICE transporté par le client (lien de
   * campagne), jamais une autorisation. L'éligibilité réelle est
   * TOUJOURS re-dérivée côté serveur (`resolveCheckoutPromoCore`) à
   * partir du contact RÉEL du client (`customer.email`/`phone`),
   * jamais déduite de ce champ seul.
   */
  campaignId?: string
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

async function nextPublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
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

  // PAY-IDEM-DB-01 — agencyId résolu ici pour que le fallback DB puisse
  // vérifier une réservation déjà créée quand Redis est indisponible, avant
  // tout re-INSERT qui échouerait en contrainte unique.
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
      code: "NO_AGENCY",
    }
  }

  return withGuestIdempotency(
    idempotencyKey,
    () => runCreateGuestTransferBooking(input, agencyId, idempotencyKey, linkedAuthUserId),
    undefined,
    () => findTransferReservationByIdempotencyKey(agencyId, idempotencyKey),
  )
}

async function findTransferReservationByIdempotencyKey(
  agencyId: string,
  idempotencyKey: string,
): Promise<CreateGuestTransferBookingResult | null> {
  const rows = await withSystemContext((db) =>
    db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
        tndAmount: reservations.tndAmount,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          eq(reservations.guestIdempotencyKey, idempotencyKey),
          eq(reservations.module, "transfer"),
        ),
      )
      .limit(1),
  )
  const row = rows[0]
  if (!row) return null
  return {
    ok: true,
    reservationId: row.id,
    publicRef: row.publicRef,
    guestAccessToken: row.guestAccessToken,
    totalTnd: Number(row.tndAmount ?? 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Internal runner                                                            */
/* -------------------------------------------------------------------------- */

async function runCreateGuestTransferBooking(
  input: GuestTransferBookingInput,
  agencyId: string,
  idempotencyKey: string,
  linkedAuthUserId: string | null,
): Promise<CreateGuestTransferBookingResult> {

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
          channel: "direct",
        })
        if (!pricing) throw new Error("NO_PRICING")

        // --- PRICING-PROMO-LINK-01 — remise PROMO, si éligible ---
        // Appliquée ICI, AVANT toute dérivation (reservations/payments/
        // recordReservationFinancials consomment tous `totalTnd`
        // ci-dessous) — jamais seulement avant l'enregistrement
        // financier. `campaignId` est un INDICE transporté par le
        // client, jamais une autorisation : `resolveCheckoutPromoCore`
        // re-dérive l'éligibilité réelle depuis le contact réel.
        // Transfert : pas de coût fournisseur séparé (prix catalogue =
        // prix de vente, voir recordReservationFinancials ci-dessous) —
        // `supplierPriceTnd` omis, jamais fabriqué.
        let totalTnd = pricing.totalTnd
        if (input.campaignId) {
          const checkoutPromo = await resolveCheckoutPromoCore(tx, {
            agencyId,
            campaignId: input.campaignId,
            email: input.customer.email ?? null,
            phone: input.customer.phone,
          })
          if (checkoutPromo.eligible) {
            totalTnd = applyPromoDiscountCore(
              totalTnd,
              checkoutPromo.discount,
            ).finalPriceTnd
          }
        }

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
            guestIdempotencyKey: idempotencyKey,
            module: "transfer",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: totalTnd.toFixed(2),
            tndAmount: totalTnd.toFixed(2),
            depositAmount: totalTnd.toFixed(2),
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
          .returning({
            id: reservations.id,
            guestAccessToken: reservations.guestAccessToken,
          })

        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        // 5. Données financières (Break 4 — Chantier 62 : tous les modules)
        // ECON-WIRING-02 — economic_entitlements. Même pattern que le module
        // B2B (lib/transfers/actions.ts) : catalogue propre à l'agence OTA,
        // pas de fournisseur externe modélisé. Coût = base + majoration nuit
        // (avant marge), marge = totalTnd - coût.
        const transferSupplierCostTnd =
          pricing.basePriceTnd + pricing.nightSurchargeAmount
        const { commissionAmount } = await recordReservationFinancials({
          tx,
          reservationId,
          supplierPriceTnd: transferSupplierCostTnd,
          salePriceTnd: totalTnd,
          economicEntitlements: [
            {
              partyType: "agency",
              partyId: agencyId,
              role: "product_owner",
              qualification: "supplier_cost",
              amount: transferSupplierCostTnd,
              basis: "tarif propre de l'agence OTA (base + majoration nuit)",
            },
            {
              partyType: "agency",
              partyId: agencyId,
              role: "seller",
              qualification: "seller_margin",
              amount: totalTnd - transferSupplierCostTnd,
              basis:
                "marge vendeur (agence product_owner ET seller sur son propre tarif)",
            },
          ],
        })
        await creditPlatformCommission(tx, {
          reservationId,
          commissionAmount,
          description: `Commission transfert — réservation ${publicRef}`,
        })

        // 6. Paiement en attente — règlement différé (virement / espèces)
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

        // 7. Extension Transfer
        await tx.insert(reservationTransfer).values({
          reservationId,
          agencyId,
          pickupZoneId: input.fromZoneId,
          dropoffZoneId: input.toZoneId,
          pickupAddress: fromZone?.name,
          dropoffAddress: toZone?.name,
          flightNumber: input.flightNumber,
          flightArrivalAt: input.flightArrivalAt
            ? new Date(input.flightArrivalAt)
            : undefined,
          pax: input.pax,
          luggageCount: input.luggageCount ?? 0,
          vehicleType: input.vehicleType,
          statusTimeline: {
            created: { at: new Date().toISOString(), status: "created" },
          },
        })

        // 7. Audit
        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: null,
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
