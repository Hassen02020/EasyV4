"use server"

/**
 * Réservation voiture B2C autonome (guest checkout).
 *
 * Chemin PARALLÈLE à createCarBooking (lib/cars/actions.ts) — celui-ci
 * reste intact pour le B2B. Même modèle que les autres actions guest
 * (Omra, Activités, Transferts) :
 *   - agencyId résolu via getDefaultAgencyId()
 *   - Aucun débit wallet
 *   - status "pending" + payment "pending" (règlement différé)
 *   - Prix et disponibilité 100% vérifiés côté serveur
 *   - guestAccessToken généré par DB DEFAULT, retourné au client pour
 *     /booking/confirmation/[ref]?token=…
 */

import { eq, and, sql } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationCar,
  carLocations,
  carCategories,
  carAvailability,
  carFleetVehicles,
  customers,
  auditEvents,
  payments,
} from "@/lib/db/schema"
import { calculateCarPrice } from "./pricing"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { resolveCheckoutPromoCore } from "@/lib/crm/promo-checkout-core"
import { applyPromoDiscountCore } from "@/lib/finance/promo-discount-core"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { sendEvent } from "@/lib/inngest/client"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface GuestCarBookingInput {
  categoryId: string
  pickupLocationId: string
  dropoffLocationId: string
  pickupAt: string // ISO datetime
  dropoffAt: string // ISO datetime
  insuranceLevel: "basic" | "standard" | "premium" | "full"
  driver: {
    firstName: string
    lastName: string
    phone: string
    email?: string
    licenseNumber: string
    licenseCountry?: string
    birthDate?: string // YYYY-MM-DD
  }
  /**
   * PRICING-PROMO-LINK-01 — INDICE transporté par le client (lien de
   * campagne), jamais une autorisation. L'éligibilité réelle est
   * TOUJOURS re-dérivée côté serveur (`resolveCheckoutPromoCore`) à
   * partir du contact réel du conducteur.
   */
  campaignId?: string
}

export type CreateGuestCarBookingResult =
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
  const prefix = `CR-${year}-`
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

async function checkCarAvailability(
  tx: DrizzleTransaction,
  agencyId: string,
  categoryId: string,
  locationId: string,
  pickupDate: string,
): Promise<{
  available: boolean
  availRowId: string | null
  availVehicleId: string | null
}> {
  const [availRow] = await tx
    .select()
    .from(carAvailability)
    .where(
      and(
        eq(carAvailability.agencyId, agencyId),
        eq(carAvailability.categoryId, categoryId),
        eq(carAvailability.locationId, locationId),
        eq(carAvailability.date, pickupDate),
      ),
    )
    .limit(1)
    .for("update")

  if (availRow) {
    return {
      available:
        availRow.status === "open" &&
        availRow.bookedUnits < availRow.totalUnits,
      availRowId: availRow.id,
      availVehicleId: null,
    }
  }

  // Fallback : aucune ligne car_availability pour cette date — on verrouille
  // un véhicule précis pour éviter la double-attribution concurrente.
  const [vehicle] = await tx
    .select({ id: carFleetVehicles.id })
    .from(carFleetVehicles)
    .where(
      and(
        eq(carFleetVehicles.agencyId, agencyId),
        eq(carFleetVehicles.categoryId, categoryId),
        eq(carFleetVehicles.currentLocationId, locationId),
        eq(carFleetVehicles.status, "available"),
      ),
    )
    .limit(1)
    .for("update")

  return {
    available: !!vehicle,
    availRowId: null,
    availVehicleId: vehicle?.id ?? null,
  }
}

/* -------------------------------------------------------------------------- */
/* Public Action                                                              */
/* -------------------------------------------------------------------------- */

export async function createGuestCarBooking(
  input: GuestCarBookingInput,
): Promise<CreateGuestCarBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }
  if (
    new Date(input.dropoffAt).getTime() <= new Date(input.pickupAt).getTime()
  ) {
    return {
      ok: false,
      error: "La date de retour doit être après la date de prise en charge",
    }
  }

  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        categoryId: input.categoryId,
        pickupLocationId: input.pickupLocationId,
        dropoffLocationId: input.dropoffLocationId,
        pickupAt: input.pickupAt,
        dropoffAt: input.dropoffAt,
        phone: input.driver.phone,
        licenseNumber: input.driver.licenseNumber,
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(input.driver.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestCarBooking(input, linkedAuthUserId),
  )
}

/* -------------------------------------------------------------------------- */
/* Internal runner                                                            */
/* -------------------------------------------------------------------------- */

async function runCreateGuestCarBooking(
  input: GuestCarBookingInput,
  linkedAuthUserId: string | null,
): Promise<CreateGuestCarBookingResult> {
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
        // 1. Prix 100% serveur
        const pricing = await calculateCarPrice({
          categoryId: input.categoryId,
          locationId: input.pickupLocationId,
          pickupAt: input.pickupAt,
          dropoffAt: input.dropoffAt,
          insuranceLevel: input.insuranceLevel,
          agencyId,
        })
        if (!pricing) throw new Error("NO_PRICING")

        // 2. Vérification disponibilité réelle
        const { available, availRowId, availVehicleId } =
          await checkCarAvailability(
            tx,
            agencyId,
            input.categoryId,
            input.pickupLocationId,
            input.pickupAt.slice(0, 10),
          )
        if (!available) throw new Error("NO_AVAILABILITY")

        // --- PRICING-PROMO-LINK-01 — remise PROMO, si éligible ---
        // Appliquée ICI, AVANT toute dérivation (reservations/payments,
        // recordReservationFinancials plus bas). `campaignId` est un
        // INDICE transporté par le client, jamais une autorisation :
        // `resolveCheckoutPromoCore` re-dérive l'éligibilité réelle depuis
        // le contact réel du conducteur. Voiture : pas de coût fournisseur
        // externe (catalogue agence = prix de vente, voir
        // recordReservationFinancials ci-dessous) — `supplierPriceTnd`
        // omis, jamais fabriqué.
        let totalTnd = pricing.totalTnd
        if (input.campaignId) {
          const checkoutPromo = await resolveCheckoutPromoCore(tx, {
            agencyId,
            campaignId: input.campaignId,
            email: input.driver.email ?? null,
            phone: input.driver.phone,
          })
          if (checkoutPromo.eligible) {
            totalTnd = applyPromoDiscountCore(
              totalTnd,
              checkoutPromo.discount,
            ).finalPriceTnd
          }
        }

        // 3. Noms catégorie + lieux pour l'affichage
        const [category] = await tx
          .select({ name: carCategories.name })
          .from(carCategories)
          .where(eq(carCategories.id, input.categoryId))
          .limit(1)
        const [pickupLocation] = await tx
          .select({ name: carLocations.name })
          .from(carLocations)
          .where(eq(carLocations.id, input.pickupLocationId))
          .limit(1)
        const [dropoffLocation] = await tx
          .select({ name: carLocations.name })
          .from(carLocations)
          .where(eq(carLocations.id, input.dropoffLocationId))
          .limit(1)

        const offerLabel = `${category?.name ?? input.categoryId} — ${pickupLocation?.name ?? input.pickupLocationId}`

        // 4. Client (conducteur = contact principal)
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: "M",
            firstName: input.driver.firstName,
            lastName: input.driver.lastName,
            email: input.driver.email,
            phone: input.driver.phone,
            civicId: input.driver.licenseNumber,
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })

        // 5. Réservation générique — status "pending" (pas de débit wallet)
        const publicRef = await nextPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId: customer.id,
            publicRef,
            module: "car",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: totalTnd.toFixed(2),
            tndAmount: totalTnd.toFixed(2),
            depositAmount: totalTnd.toFixed(2),
            depositPaid: "0",
            providerPayload: {
              categoryId: input.categoryId,
              categoryName: category?.name,
              pickupLocationId: input.pickupLocationId,
              pickupLocationName: pickupLocation?.name,
              dropoffLocationId: input.dropoffLocationId,
              dropoffLocationName: dropoffLocation?.name,
              pickupAt: input.pickupAt,
              dropoffAt: input.dropoffAt,
              insuranceLevel: input.insuranceLevel,
              pricing,
              // Champs lisibles par /booking/confirmation/[ref]
              offerLabel,
              startDate: input.pickupAt.slice(0, 10),
              endDate: input.dropoffAt.slice(0, 10),
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

        // 6. Paiement en attente
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

        // Coût base ↔ prix agence — alimente le Dashboard Marges, même motif
        // que le chemin B2B (lib/cars/actions.ts) : réutilise les DEUX
        // montants déjà calculés par calculateCarPrice()/applyMargin(),
        // jamais un recalcul.
        // ECON-WIRING-01 — voir lib/cars/actions.ts (chemin B2B) pour le
        // commentaire complet : agence product_owner ET seller (catalogue
        // propre, pas de fournisseur externe), pas de commission aujourd'hui.
        const carSupplierCostTnd =
          pricing.baseTotalTnd + pricing.insuranceTotalTnd
        const { commissionAmount } = await recordReservationFinancials({
          tx,
          reservationId,
          supplierPriceTnd: carSupplierCostTnd,
          salePriceTnd: totalTnd,
          economicEntitlements: [
            {
              partyType: "agency",
              partyId: agencyId,
              role: "product_owner",
              qualification: "supplier_cost",
              amount: carSupplierCostTnd,
              basis:
                "tarif propre de l'agence (car_pricing_rates : base + assurance)",
            },
            {
              partyType: "agency",
              partyId: agencyId,
              role: "seller",
              qualification: "seller_margin",
              amount: totalTnd - carSupplierCostTnd,
              basis:
                "marge vendeur (agence product_owner ET seller sur son propre tarif)",
            },
          ],
        })
        await creditPlatformCommission(tx, {
          reservationId,
          commissionAmount,
          description: `Commission réservation voiture ${publicRef}`,
        })

        // 7. Extension Car
        await tx.insert(reservationCar).values({
          reservationId,
          agencyId,
          categoryId: input.categoryId,
          pickupLocationId: input.pickupLocationId,
          dropoffLocationId: input.dropoffLocationId,
          pickupAt: new Date(input.pickupAt),
          dropoffAt: new Date(input.dropoffAt),
          rentalDays: pricing.rentalDays,
          driverFullName: `${input.driver.firstName} ${input.driver.lastName}`,
          driverLicenseNumber: input.driver.licenseNumber,
          driverLicenseCountry: input.driver.licenseCountry,
          driverBirthDate: input.driver.birthDate,
          insuranceLevel: input.insuranceLevel,
          depositAmountTnd: String(pricing.depositTnd),
        })

        if (availRowId) {
          await tx
            .update(carAvailability)
            .set({ bookedUnits: sql`${carAvailability.bookedUnits} + 1` })
            .where(eq(carAvailability.id, availRowId))
        } else if (availVehicleId) {
          await tx
            .update(carFleetVehicles)
            .set({ status: "rented" })
            .where(eq(carFleetVehicles.id, availVehicleId))
        }

        // 8. Audit
        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: null,
          entityType: "reservation",
          entityId: reservationId,
          action: "car_booking.created",
          diff: {
            categoryId: input.categoryId,
            pickupLocationId: input.pickupLocationId,
            dropoffLocationId: input.dropoffLocationId,
            pickupAt: input.pickupAt,
            dropoffAt: input.dropoffAt,
            totalTnd,
            publicRef,
            channel: "b2c_guest",
          },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          totalTnd,
          rentalDays: pricing.rentalDays,
          categoryName: category?.name ?? null,
          pickupLocationName: pickupLocation?.name ?? null,
          dropoffLocationName: dropoffLocation?.name ?? null,
        }
      },
    )

    // CAR-VOUCHER-01 — envoi email + PDF en arrière-plan (Inngest, fire-and-forget).
    // Pas de await : un échec d'envoi ne doit jamais invalider la réservation B2C.
    sendEvent("booking/car.confirmed", {
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      agencyId,
      guestAccessToken: result.guestAccessToken,
      customerEmail: input.driver.email ?? null,
      customerName: `${input.driver.firstName} ${input.driver.lastName}`,
      categoryName: result.categoryName ?? input.categoryId,
      pickupLocationName: result.pickupLocationName ?? input.pickupLocationId,
      dropoffLocationName: result.dropoffLocationName ?? input.dropoffLocationId,
      pickupAt: input.pickupAt,
      dropoffAt: input.dropoffAt,
      rentalDays: result.rentalDays,
      insuranceLevel: input.insuranceLevel,
      totalTnd: result.totalTnd,
    }).catch((err) =>
      console.error("[cars-guest] sendEvent booking/car.confirmed échoué", err),
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
      NO_PRICING: "Aucun tarif configuré pour cette catégorie et ce lieu",
      NO_AVAILABILITY: "Aucun véhicule disponible pour ces dates",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
