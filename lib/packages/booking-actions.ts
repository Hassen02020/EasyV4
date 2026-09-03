"use server"

/**
 * Réservation Voyages Organisés (Packages) — moteur minimal viable
 * (Phase 12, Partie 9-10).
 *
 * Constat Phase 11 : aucun moteur de réservation Packages n'existait, ni
 * B2C ni B2B (`app/packages/[slug]/page.tsx` n'affichait qu'un CTA de
 * contact). Le modèle de données existait déjà et était suffisant pour une
 * vraie réservation (`catalog_packages` / `catalog_package_departures`
 * avec stock réel `totalSeats`/`bookedSeats`, prix adulte/enfant réels,
 * et `reservation_package` déjà prêt à recevoir une réservation) — ce
 * fichier construit le moteur qui en manquait, sans fabriquer aucune
 * disponibilité ni aucun prix : tout est lu depuis `catalog_package_departures`
 * sous verrou `FOR UPDATE`, exactement comme `createOmraBooking`/
 * `createGuestOmraBooking` le font pour les allotements Omra.
 *
 * Un seul moteur (pas de B2B séparé comme Hôtel/Omra) : rien n'existait
 * avant, donc pas de chemin déjà validé à préserver. Même séparation de
 * règlement que le reste du B2C (Partie 5) : "card" → `PaymentProvider`,
 * honnête si non configuré, jamais de faux succès ; "transfer"/"cash" →
 * réservation réelle en attente, voucher/facture différés à la
 * confirmation du règlement. Prix 100% dérivé du serveur
 * (`adultPriceTnd`/`childPriceTnd` du départ verrouillé) — le client ne
 * fournit jamais de prix.
 */

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { withTenantContext, resolveSessionContext } from "@/lib/db/tenant-context"
import {
  customers,
  reservations,
  reservationPackage,
  catalogPackages,
  catalogPackageDepartures,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { computePriceBreakdown } from "@/lib/booking/pricing"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import {
  packageGuestBookingSchema,
  packagePartnerBookingSchema,
  type PackageGuestBookingInput,
  type PackagePartnerBookingInput,
} from "./schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import type { TravelerInput } from "@/lib/booking/schemas"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { resolveCancellationPolicy, buildPolicySnapshot } from "@/lib/booking/policy-engine"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { earnPendingPoints } from "@/lib/loyalty/rewards-core"

export type CreateGuestPackageBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
    }
  | { ok: false; error: string; code?: string }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

class PaymentRejected extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

export async function createGuestPackageBooking(input: {
  booking: PackageGuestBookingInput
  paymentMethod: GuestPaymentMethod
}): Promise<CreateGuestPackageBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = packageGuestBookingSchema.safeParse(input.booking)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  if (!["card", "transfer", "cash"].includes(input.paymentMethod)) {
    return { ok: false, error: "Mode de paiement invalide pour une réservation en ligne." }
  }

  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        packageId: parsed.data.packageId,
        departureId: parsed.data.departureId,
        adults: parsed.data.adults,
        children: parsed.data.children,
        travelerEmail: parsed.data.traveler.email,
        paymentMethod: input.paymentMethod,
      }),
    )
    .digest("hex")

  // PHASE "CUSTOMER RESERVATION LINK" — voir lib/booking/customer-identity.ts.
  const linkedAuthUserId = await resolveLinkedAuthUserId(parsed.data.traveler.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestPackageBooking(parsed.data, input.paymentMethod, linkedAuthUserId),
  )
}

async function runCreateGuestPackageBooking(
  booking: PackageGuestBookingInput,
  paymentMethod: GuestPaymentMethod,
  linkedAuthUserId: string | null,
): Promise<CreateGuestPackageBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe n'est configurée pour le moment." }
  }

  const traveler: TravelerInput = booking.traveler
  const paxCount = booking.adults + booking.children

  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // --- 1. Package + départ (verrou FOR UPDATE, prix/stock 100% serveur) ---
        const [pkg] = await tx
          .select()
          .from(catalogPackages)
          .where(and(eq(catalogPackages.id, booking.packageId), eq(catalogPackages.agencyId, agencyId)))
          .limit(1)
        if (!pkg) throw new Error("PACKAGE_NOT_FOUND")
        if (pkg.status !== "published") throw new Error("PACKAGE_NOT_ACTIVE")
        if (!pkg.channels?.includes("b2c")) throw new Error("PACKAGE_NOT_ACTIVE")

        const [departure] = await tx
          .select()
          .from(catalogPackageDepartures)
          .where(
            and(
              eq(catalogPackageDepartures.id, booking.departureId),
              eq(catalogPackageDepartures.packageId, booking.packageId),
            ),
          )
          .limit(1)
          .for("update")
        if (!departure) throw new Error("DEPARTURE_NOT_FOUND")
        if (departure.status !== "open") throw new Error("DEPARTURE_NOT_OPEN")

        const seatsLeft = departure.totalSeats - departure.bookedSeats
        if (seatsLeft < paxCount) {
          throw new Error(`INSUFFICIENT_STOCK: ${seatsLeft} places disponibles, ${paxCount} demandées`)
        }

        const unitPriceTnd = parseFloat(departure.adultPriceTnd)
        const unitChildPriceTnd = departure.childPriceTnd ? parseFloat(departure.childPriceTnd) : undefined
        const breakdown = computePriceBreakdown({
          unitPriceTnd,
          adults: booking.adults,
          children: booking.children,
          unitChildPriceTnd,
          depositPercent: departure.depositPercent,
        })
        const totalTnd = breakdown.totalTnd

        // --- Politique d'annulation (Policy Engine Omra/Package/Activity) ---
        // Résolue et figée AU MOMENT de cette réservation précise (spécifique
        // au package > défaut agence > aucune) — voir lib/booking/policy-engine.ts.
        const resolvedPolicy = await resolveCancellationPolicy(tx, {
          agencyId,
          productType: "package",
          productId: booking.packageId,
        })
        const policySnapshot = buildPolicySnapshot(resolvedPolicy, booking.policyAccepted)

        // --- 2. Règlement (card = paiement réel immédiat, jamais de faux succès) ---
        if (paymentMethod === "card") {
          const provider = getPaymentProvider()
          const paymentResult = await provider.createPayment({
            amountTnd: totalTnd,
            currency: "TND",
            reference: `guest-package-${Date.now()}`,
            description: `Voyage organisé — ${pkg.title}`,
            customerEmail: traveler.email,
          })
          if (!paymentResult.ok) {
            throw new PaymentRejected(paymentResult.message ?? "Le paiement n'a pas pu être traité.", paymentResult.code)
          }
        }
        const isImmediatelyPaid = paymentMethod === "card"

        // --- 3. Client ---
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: traveler.civility,
            firstName: traveler.firstName,
            lastName: traveler.lastName,
            email: traveler.email,
            phone: traveler.phone,
            civicId: traveler.civicId,
            civicIdType: traveler.civicIdType,
            birthDate: traveler.birthDate || undefined,
            nationality: traveler.nationality || undefined,
            // PHASE "CUSTOMER RESERVATION LINK" — nouvelle ligne dans tous
            // les cas, aucune réattribution possible ; `null` = guest
            // inchangé. Voir lib/booking/customer-identity.ts.
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })
        const customerId = customer.id

        // --- 4. Réservation ---
        const publicRef = await nextPackagePublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId,
            publicRef,
            module: "package",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              packageId: booking.packageId,
              departureId: booking.departureId,
              adults: booking.adults,
              children: booking.children,
              breakdown,
              offerLabel: pkg.title,
              startDate: departure.departureDate,
              endDate: departure.returnDate,
              channel: "b2c_guest",
              paymentMethod,
              policySnapshot,
            },
          })
          .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })
        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        if (isImmediatelyPaid) {
          await tx
            .update(reservations)
            .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
            .where(eq(reservations.id, reservationId))
        }

        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: paymentMethod,
          originalCurrency: "TND",
          originalAmount: totalTnd.toFixed(2),
          tndAmount: totalTnd.toFixed(2),
          kind: "deposit",
          status: isImmediatelyPaid ? "captured" : "pending",
          capturedAt: isImmediatelyPaid ? new Date() : undefined,
        })

        // Easy2Book Rewards (Phase 38D) — B2C uniquement (voir doc de tête
        // lib/loyalty/rewards-core.ts), montant éligible = paiement
        // réellement capturé, jamais totalTnd seul.
        if (isImmediatelyPaid) {
          const rewardsSummary = await getReservationPaymentSummary({
            reservationId,
            txOverride: tx as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
          })
          await earnPendingPoints(tx, {
            agencyId,
            customerId,
            reservationId,
            module: "package",
            eligibleTnd: rewardsSummary.collectedTnd,
            idempotencyKey: `earn-pending:${reservationId}`,
          })
        }

        // --- 5. Extension Package ---
        await tx.insert(reservationPackage).values({
          reservationId,
          agencyId,
          packageId: booking.packageId,
          departureId: booking.departureId,
          departureDate: departure.departureDate,
          returnDate: departure.returnDate,
          adults: booking.adults,
          childrenAges: booking.childrenAges,
          travelers: [{ ...traveler, isPrimary: true }],
        })

        // --- 6. Décrément du stock (seulement si on arrive jusqu'ici) ---
        await tx
          .update(catalogPackageDepartures)
          .set({ bookedSeats: departure.bookedSeats + paxCount })
          .where(eq(catalogPackageDepartures.id, departure.id))

        await tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: reservationId,
          action: "package_booking.created",
          diff: { packageId: booking.packageId, departureId: booking.departureId, paxCount, totalTnd, publicRef, via: "b2c_guest", paymentMethod },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          status: (isImmediatelyPaid ? "confirmed" : "pending") as "confirmed" | "pending",
        }
      },
    )

    // NB : pas d'événement Inngest de confirmation ici — "booking/confirmed"
    // (lib/inngest/client.ts) génère un voucher PDF et un email spécifiques
    // à l'hôtel (lib/pdf/voucher-hotel.tsx, hotelName/checkIn/checkOut) ;
    // le réutiliser pour un Package enverrait un email trompeur. La
    // confirmation reste visible immédiatement en page (redirection
    // `/booking/confirmation/[ref]`) et le voucher réel est téléchargeable
    // via `/api/packages/voucher/[ref]`. Un événement Inngest dédié
    // ("booking/package.confirmed") reste une amélioration documentée, pas
    // un blocage du moteur de réservation lui-même.

    if (result.status === "confirmed") {
      try {
        const invoiceResult = await generateInvoiceForReservation({
          agencyId,
          reservationId: result.reservationId,
          actorUserId: "",
        })
        if (!invoiceResult.ok) {
          console.error("[package-guest] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error("[package-guest] génération facture échouée", err instanceof Error ? err.message : String(err))
      }
    }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      status: result.status,
    }
  } catch (err) {
    if (err instanceof PaymentRejected) {
      return { ok: false, error: err.message, code: err.code }
    }
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      PACKAGE_NOT_FOUND: "Voyage organisé introuvable",
      PACKAGE_NOT_ACTIVE: "Ce voyage n'est plus actif",
      DEPARTURE_NOT_FOUND: "Départ introuvable pour ce voyage",
      DEPARTURE_NOT_OPEN: "Ce départ n'est plus ouvert à la réservation",
      INSUFFICIENT_STOCK: msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Stock insuffisant",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return { ok: false, error: code ? codes[code] : "Erreur interne lors de la création de la réservation.", code: code ?? "INTERNAL_ERROR" }
  }
}

/* -------------------------------------------------------------------------- */
/* B2B (Phase 13.1, gap #2) — même modèle que createOmraBooking/            */
/* createActivityBooking : session partenaire, débit wallet, pas de marge   */
/* appliquée (cohérence avec createOmraBooking, déjà validé, qui n'en       */
/* applique pas non plus — voir lib/activities/booking-actions.ts).         */
/* -------------------------------------------------------------------------- */

export type CreatePackageBookingResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: string }

export async function createPackageBooking(
  input: PackagePartnerBookingInput,
): Promise<CreatePackageBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = packagePartnerBookingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const booking = parsed.data
  const paxCount = booking.adults + booking.children

  const session = await resolveSessionContext()
  if (!session.ok) {
    return { ok: false, error: "Non authentifié" }
  }
  if (!session.agencyId) {
    return { ok: false, error: "Profil utilisateur introuvable" }
  }
  const agencyId = session.agencyId
  const createdByUserId = session.userId

  try {
    const result = await withTenantContext(
      { agencyId, userId: createdByUserId, isSuperAdmin: session.isSuperAdmin },
      async (tx) => {
        // RLS décide si cette agence peut voir ce package : propriétaire OU autorisée (product_authorizations).
        const [pkg] = await tx
          .select()
          .from(catalogPackages)
          .where(eq(catalogPackages.id, booking.packageId))
          .limit(1)
        if (!pkg) throw new Error("PACKAGE_NOT_FOUND")
        if (pkg.status !== "published") throw new Error("PACKAGE_NOT_ACTIVE")
        if (!pkg.channels?.includes("b2b")) throw new Error("PACKAGE_NOT_ACTIVE")

        const [departure] = await tx
          .select()
          .from(catalogPackageDepartures)
          .where(
            and(
              eq(catalogPackageDepartures.id, booking.departureId),
              eq(catalogPackageDepartures.packageId, booking.packageId),
            ),
          )
          .limit(1)
          .for("update")
        if (!departure) throw new Error("DEPARTURE_NOT_FOUND")
        if (departure.status !== "open") throw new Error("DEPARTURE_NOT_OPEN")

        const seatsLeft = departure.totalSeats - departure.bookedSeats
        if (seatsLeft < paxCount) {
          throw new Error(`INSUFFICIENT_STOCK: ${seatsLeft} places disponibles, ${paxCount} demandées`)
        }

        const unitPriceTnd = parseFloat(departure.adultPriceTnd)
        const unitChildPriceTnd = departure.childPriceTnd ? parseFloat(departure.childPriceTnd) : undefined
        const breakdown = computePriceBreakdown({
          unitPriceTnd,
          adults: booking.adults,
          children: booking.children,
          unitChildPriceTnd,
          depositPercent: 100,
        })
        const totalTnd = breakdown.totalTnd

        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: "M",
            firstName: booking.customerFirstName,
            lastName: booking.customerLastName,
            email: booking.customerEmail || undefined,
            phone: booking.customerPhone,
          })
          .returning({ id: customers.id })
        const customerId = customer.id

        const publicRef = await nextPackagePublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId,
            publicRef,
            module: "package",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              packageId: booking.packageId,
              departureId: booking.departureId,
              adults: booking.adults,
              children: booking.children,
              breakdown,
              offerLabel: pkg.title,
              startDate: departure.departureDate,
              endDate: departure.returnDate,
              channel: "b2b",
            },
          })
          .returning({ id: reservations.id })
        const reservationId = reservation.id

        const debitResult = await debitPartnerCredit({
          agencyId,
          amountTnd: totalTnd,
          reference: publicRef,
          description: `Réservation Voyage Organisé — ${pkg.title}`,
          createdByUserId,
          reservationId,
          idempotencyKey: `booking-debit:${reservationId}`,
          txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
        })
        if (!debitResult.ok) {
          throw new Error(debitResult.code === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_BALANCE" : "WALLET_DEBIT_FAILED")
        }

        await tx
          .update(reservations)
          .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
          .where(eq(reservations.id, reservationId))

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

        await tx.insert(reservationPackage).values({
          reservationId,
          agencyId,
          packageId: booking.packageId,
          departureId: booking.departureId,
          departureDate: departure.departureDate,
          returnDate: departure.returnDate,
          adults: booking.adults,
          childrenAges: booking.childrenAges,
          travelers: [{
            firstName: booking.customerFirstName,
            lastName: booking.customerLastName,
            phone: booking.customerPhone,
            email: booking.customerEmail || undefined,
            isPrimary: true,
          }],
        })

        await tx
          .update(catalogPackageDepartures)
          .set({ bookedSeats: departure.bookedSeats + paxCount })
          .where(eq(catalogPackageDepartures.id, departure.id))

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: createdByUserId,
          entityType: "reservation",
          entityId: reservationId,
          action: "package_booking.created",
          diff: { packageId: booking.packageId, departureId: booking.departureId, paxCount, totalTnd, publicRef, via: "b2b" },
        })

        return { reservationId, publicRef }
      },
    )

    try {
      const invoiceResult = await generateInvoiceForReservation({
        agencyId,
        reservationId: result.reservationId,
        actorUserId: createdByUserId,
      })
      if (!invoiceResult.ok) {
        console.error("[package-b2b] génération facture échouée", invoiceResult.error)
      }
    } catch (err) {
      console.error("[package-b2b] génération facture échouée", err instanceof Error ? err.message : String(err))
    }

    return { ok: true, reservationId: result.reservationId, publicRef: result.publicRef }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      PACKAGE_NOT_FOUND: "Voyage organisé introuvable ou non autorisé pour votre agence",
      PACKAGE_NOT_ACTIVE: "Ce voyage n'est plus disponible en B2B",
      DEPARTURE_NOT_FOUND: "Départ introuvable pour ce voyage",
      DEPARTURE_NOT_OPEN: "Ce départ n'est plus ouvert à la réservation",
      INSUFFICIENT_STOCK: msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Stock insuffisant",
      INSUFFICIENT_BALANCE: "Solde wallet insuffisant",
      WALLET_DEBIT_FAILED: "Erreur lors du débit wallet",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return { ok: false, error: code ? codes[code] : "Erreur interne lors de la création de la réservation.", code: code ?? "INTERNAL_ERROR" }
  }
}

async function nextPackagePublicRef(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PK-${year}-`
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
