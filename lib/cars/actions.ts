/**
 * Server Actions — Module Location de Voitures (Car Rental)
 *
 * createCarBooking : réservation atomique, même architecture que
 * `lib/transfers/actions.ts::createTransferBooking` (dont ce fichier est
 * directement dérivé) :
 *   - Calcul du prix (via pricing.ts)
 *   - Vérification de disponibilité réelle (jamais une disponibilité
 *     inventée — voir checkCarAvailability ci-dessous)
 *   - Débit wallet atomique (FOR UPDATE, via debitPartnerCredit)
 *   - Création réservation générique + extension `reservation_car`
 *   - Historisation comptable (audit)
 *
 * Ne crée PAS de deuxième moteur de wallet/débit/réservation générique —
 * réutilise `debitPartnerCredit`, `reservations`, `payments`,
 * `generateInvoiceForReservation` tels quels.
 */

"use server"

import { eq, and, sql } from "drizzle-orm"
import { runInTenantContext } from "@/lib/db/tenant-context"
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
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { calculateCarPrice } from "./pricing"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import { sendEvent } from "@/lib/inngest/client"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface CarBookingInput {
  // agencyId résolu depuis la session serveur
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
  // createdByUserId résolu depuis la session serveur
}

export type CarBookingResult =
  | { ok: true; reservationId: string; publicRef: string; totalTnd: number }
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
    .select({
      maxRef: sql<string | null>`MAX(${reservations.publicRef})`,
    })
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

/**
 * Vérifie qu'un véhicule est réellement disponible pour la catégorie/lieu
 * demandés, sans jamais fabriquer une disponibilité.
 *
 * Le schéma (`lib/db/schema/cars.ts`) autorise explicitement deux sources
 * au choix de l'agence : un pool `car_availability` (objectif commercial,
 * par jour) ou le compte de `car_fleet_vehicles` réellement `available`
 * sur ce lieu. On préfère `car_availability` si une ligne existe pour la
 * date de prise en charge (source la plus précise) ; sinon on retombe sur
 * le compte de flotte. Si aucune des deux sources n'a de donnée du tout,
 * on refuse la réservation plutôt que de la confirmer sans preuve de stock.
 */
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
/* Main Action                                                               */
/* -------------------------------------------------------------------------- */

export async function createCarBooking(
  input: CarBookingInput,
): Promise<CarBookingResult> {
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

  try {
    const outcome = await runInTenantContext(async (tx, ctx) => {
      if (!ctx.agencyId) {
        throw new Error("NO_AGENCY")
      }
      const agencyId = ctx.agencyId
      const createdByUserId = ctx.userId

      const pricing = await calculateCarPrice({
        categoryId: input.categoryId,
        locationId: input.pickupLocationId,
        pickupAt: input.pickupAt,
        dropoffAt: input.dropoffAt,
        insuranceLevel: input.insuranceLevel,
        agencyId,
      })
      if (!pricing) {
        throw new Error("NO_PRICING")
      }

      const { available, availRowId, availVehicleId } =
        await checkCarAvailability(
          tx,
          agencyId,
          input.categoryId,
          input.pickupLocationId,
          input.pickupAt.slice(0, 10),
        )
      if (!available) {
        throw new Error("NO_AVAILABILITY")
      }

      const totalTnd = pricing.totalTnd

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
        })
        .returning({ id: customers.id })

      const customerId = customer.id
      const publicRef = await nextPublicRef(tx, agencyId)

      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          publicRef,
          module: "car",
          source: "internal",
          status: "pending",
          originalCurrency: "TND",
          originalAmount: String(totalTnd),
          tndAmount: String(totalTnd),
          depositAmount: String(totalTnd),
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
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })

      const reservationId = reservation.id

      const debitResult = await debitPartnerCredit({
        agencyId,
        amountTnd: totalTnd,
        reference: publicRef,
        description: `Location véhicule — ${category?.name ?? input.categoryId} (${pickupLocation?.name ?? input.pickupLocationId})`,
        createdByUserId,
        reservationId,
        idempotencyKey: `booking-debit:${reservationId}`,
        txOverride: tx as Parameters<
          typeof debitPartnerCredit
        >[0]["txOverride"],
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_FUNDS"
            ? "INSUFFICIENT_BALANCE"
            : "WALLET_DEBIT_FAILED",
        )
      }

      await tx
        .update(reservations)
        .set({
          status: "confirmed",
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, reservationId))

      await recordReservationTransition(tx, {
        reservationId,
        from: "pending",
        to: "confirmed",
        triggeredBy: createdByUserId,
        reason: "Règlement wallet B2B immédiat à la création",
      })

      await tx.insert(payments).values({
        agencyId,
        reservationId,
        psp: "manual",
        method: "wallet",
        originalCurrency: "TND",
        originalAmount: totalTnd.toFixed(2),
        tndAmount: totalTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      // Coût base ↔ prix agence — alimente le Dashboard Marges (même motif
      // que lib/transfers/actions.ts pour les transferts) : réutilise les
      // DEUX montants déjà calculés par calculateCarPrice()/applyMargin(),
      // jamais un recalcul. preMargin = baseTotalTnd + insuranceTotalTnd
      // (pricing.totalTnd - marginAmount, cf. lib/cars/pricing.ts).
      // ECON-WIRING-01 — economic_entitlements. Car est un catalogue PROPRE
      // à l'agence (car_pricing_rates.agency_id), pas un fournisseur externe
      // modélisé : le coût de base (baseTotalTnd+insuranceTotalTnd) est donc
      // attribué à l'agence elle-même en tant que "product_owner", jamais
      // "external_supplier" (règle Direction, 2026-10 : product_owner ≠
      // external_supplier — déterminer QUI porte réellement le produit).
      // Aucune commission Easy2Book n'existe aujourd'hui sur ce module
      // (pas de `commissionPercent` passé ci-dessus) : pas de ligne
      // "commission" fabriquée à 0, seulement les 2 lignes réelles.
      const carSupplierCostTnd =
        pricing.baseTotalTnd + pricing.insuranceTotalTnd
      const { commissionAmount } = await recordReservationFinancials({
        tx,
        reservationId,
        supplierPriceTnd: carSupplierCostTnd,
        salePriceTnd: pricing.totalTnd,
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
            amount: pricing.totalTnd - carSupplierCostTnd,
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

      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: createdByUserId,
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
        },
      })

      return {
        reservationId,
        publicRef,
        totalTnd,
        agencyId,
        createdByUserId,
        rentalDays: pricing.rentalDays,
        categoryName: category?.name ?? null,
        pickupLocationName: pickupLocation?.name ?? null,
        dropoffLocationName: dropoffLocation?.name ?? null,
      }
    })

    if (!outcome.ok) {
      return { ok: false, error: outcome.error }
    }

    // --- Facture (hors transaction) --- Réservation + débit déjà commités ;
    // un échec de facturation ne doit jamais invalider une réservation payée.
    try {
      const invoiceResult = await generateInvoiceForReservation({
        agencyId: outcome.result.agencyId,
        reservationId: outcome.result.reservationId,
        actorUserId: outcome.result.createdByUserId,
      })
      if (!invoiceResult.ok) {
        console.error("[cars] génération facture échouée", invoiceResult.error)
      }
    } catch (err) {
      console.error(
        "[cars] génération facture échouée",
        err instanceof Error ? err.message : String(err),
      )
    }

    // CAR-VOUCHER-01 — envoi email + PDF en arrière-plan (Inngest, fire-and-forget).
    // Pas de await : un échec d'envoi ne doit jamais bloquer la confirmation B2B.
    sendEvent("booking/car.confirmed", {
      reservationId: outcome.result.reservationId,
      publicRef: outcome.result.publicRef,
      agencyId: outcome.result.agencyId,
      guestAccessToken: "",
      customerEmail: input.driver.email ?? null,
      customerName: `${input.driver.firstName} ${input.driver.lastName}`,
      categoryName: outcome.result.categoryName ?? input.categoryId,
      pickupLocationName:
        outcome.result.pickupLocationName ?? input.pickupLocationId,
      dropoffLocationName:
        outcome.result.dropoffLocationName ?? input.dropoffLocationId,
      pickupAt: input.pickupAt,
      dropoffAt: input.dropoffAt,
      rentalDays: outcome.result.rentalDays,
      insuranceLevel: input.insuranceLevel,
      totalTnd: outcome.result.totalTnd,
    }).catch((err) =>
      console.error("[cars] sendEvent booking/car.confirmed échoué", err),
    )

    return {
      ok: true,
      reservationId: outcome.result.reservationId,
      publicRef: outcome.result.publicRef,
      totalTnd: outcome.result.totalTnd,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      NO_AGENCY: "Aucune agence rattachée à ce compte",
      NO_PRICING: "Aucun tarif configuré pour cette catégorie et ce lieu",
      NO_AVAILABILITY: "Aucun véhicule disponible pour ces dates",
      INSUFFICIENT_BALANCE: "Solde wallet insuffisant",
      WALLET_DEBIT_FAILED: "Erreur lors du débit wallet",
    }

    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
