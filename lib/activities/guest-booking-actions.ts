"use server"

/**
 * Réservation Attractions B2C (guest checkout) — Phase 13.1, gap #1.
 *
 * Constat : le catalogue Attractions existe depuis Phase 13 (Master Admin
 * Builder), mais aucun moteur de réservation ne l'atteignait — ni B2C ni
 * B2B. Ce fichier construit le chemin B2C, sur le modèle exact de
 * `lib/packages/booking-actions.ts::createGuestPackageBooking` (même
 * séparation de règlement carte/virement/espèces, même idempotency guest,
 * même génération de facture différée) — adapté à une session (date +
 * horaires + capacité) plutôt qu'un départ.
 *
 * Protection de la capacité contre la concurrence : verrou `FOR UPDATE`
 * sur `catalog_activity_sessions`, exactement comme `catalog_package_departures`
 * / `omra_allotments` pour les deux autres moteurs déjà validés.
 *
 * Prix 100% serveur : `adultPriceTnd`/`childPriceTnd` lus depuis la session
 * verrouillée, jamais fournis par le client.
 */

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  customers,
  reservations,
  reservationActivity,
  catalogActivities,
  catalogActivitySessions,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { computePriceBreakdown } from "@/lib/booking/pricing"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import {
  activityGuestBookingSchema,
  validateChildAgesAgainstTariffRules,
  type ActivityGuestBookingInput,
} from "./schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import type { TravelerInput } from "@/lib/booking/schemas"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { resolveCancellationPolicy, buildPolicySnapshot } from "@/lib/booking/policy-engine"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { earnPendingPoints } from "@/lib/loyalty/rewards-core"

export type CreateGuestActivityBookingResult =
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

/** Coupure de réservation : `booking_deadline` explicite sinon date+heure de la session. */
function isPastBookingDeadline(session: {
  bookingDeadline: Date | null
  sessionDate: string
  sessionStart: string
}): boolean {
  const now = new Date()
  if (session.bookingDeadline) return now >= session.bookingDeadline
  const sessionStartsAt = new Date(`${session.sessionDate}T${session.sessionStart}:00`)
  return now >= sessionStartsAt
}

export async function createGuestActivityBooking(input: {
  booking: ActivityGuestBookingInput
  paymentMethod: GuestPaymentMethod
}): Promise<CreateGuestActivityBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = activityGuestBookingSchema.safeParse(input.booking)
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
        activityId: parsed.data.activityId,
        sessionId: parsed.data.sessionId,
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
    runCreateGuestActivityBooking(parsed.data, input.paymentMethod, linkedAuthUserId),
  )
}

async function runCreateGuestActivityBooking(
  booking: ActivityGuestBookingInput,
  paymentMethod: GuestPaymentMethod,
  linkedAuthUserId: string | null,
): Promise<CreateGuestActivityBookingResult> {
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
        // --- 1. Attraction (prix/règles serveur) ---
        const [activity] = await tx
          .select()
          .from(catalogActivities)
          .where(and(eq(catalogActivities.id, booking.activityId), eq(catalogActivities.agencyId, agencyId)))
          .limit(1)
        if (!activity) throw new Error("ACTIVITY_NOT_FOUND")
        if (activity.status !== "published") throw new Error("ACTIVITY_NOT_ACTIVE")
        if (!activity.channels?.includes("b2c")) throw new Error("ACTIVITY_NOT_ACTIVE")

        const ageError = validateChildAgesAgainstTariffRules(activity.tariffRules, booking.childrenAges)
        if (ageError) throw new Error(`CHILD_AGE_INVALID: ${ageError}`)

        // --- 2. Session (verrou FOR UPDATE, capacité/prix/deadline 100% serveur) ---
        const [session] = await tx
          .select()
          .from(catalogActivitySessions)
          .where(
            and(
              eq(catalogActivitySessions.id, booking.sessionId),
              eq(catalogActivitySessions.activityId, booking.activityId),
            ),
          )
          .limit(1)
          .for("update")
        if (!session) throw new Error("SESSION_NOT_FOUND")
        if (session.status !== "open") throw new Error("SESSION_NOT_OPEN")
        if (isPastBookingDeadline(session)) throw new Error("BOOKING_DEADLINE_PASSED")

        const capacityLeft = session.capacity - session.booked
        if (capacityLeft < paxCount) {
          throw new Error(`INSUFFICIENT_STOCK: ${capacityLeft} places disponibles, ${paxCount} demandées`)
        }

        const unitPriceTnd = parseFloat(session.adultPriceTnd)
        const unitChildPriceTnd = session.childPriceTnd ? parseFloat(session.childPriceTnd) : undefined
        const breakdown = computePriceBreakdown({
          unitPriceTnd,
          adults: booking.adults,
          children: booking.children,
          unitChildPriceTnd,
          depositPercent: 100, // Attractions : pas d'acompte partiel, règlement intégral à la réservation.
        })
        const totalTnd = breakdown.totalTnd

        // --- Politique d'annulation (Policy Engine Omra/Package/Activity) ---
        // Résolue et figée AU MOMENT de cette réservation précise (spécifique
        // à l'attraction > défaut agence > aucune) — voir lib/booking/policy-engine.ts.
        const resolvedPolicy = await resolveCancellationPolicy(tx, {
          agencyId,
          productType: "activity",
          productId: booking.activityId,
        })
        const policySnapshot = buildPolicySnapshot(resolvedPolicy, booking.policyAccepted)

        // --- 3. Règlement (card = paiement réel immédiat, jamais de faux succès) ---
        if (paymentMethod === "card") {
          const provider = getPaymentProvider()
          const paymentResult = await provider.createPayment({
            amountTnd: totalTnd,
            currency: "TND",
            reference: `guest-activity-${Date.now()}`,
            description: `Attraction — ${activity.title}`,
            customerEmail: traveler.email,
          })
          if (!paymentResult.ok) {
            throw new PaymentRejected(paymentResult.message ?? "Le paiement n'a pas pu être traité.", paymentResult.code)
          }
        }
        const isImmediatelyPaid = paymentMethod === "card"

        // --- 4. Client ---
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

        // --- 5. Réservation ---
        const publicRef = await nextActivityPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId,
            publicRef,
            module: "activity",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              activityId: booking.activityId,
              sessionId: booking.sessionId,
              adults: booking.adults,
              children: booking.children,
              breakdown,
              offerLabel: activity.title,
              sessionDate: session.sessionDate,
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
            module: "activity",
            eligibleTnd: rewardsSummary.collectedTnd,
            idempotencyKey: `earn-pending:${reservationId}`,
          })
        }

        // --- 6. Extension Activity ---
        await tx.insert(reservationActivity).values({
          reservationId,
          agencyId,
          activityId: booking.activityId,
          sessionId: booking.sessionId,
          sessionDate: session.sessionDate,
          sessionStart: session.sessionStart,
          sessionEnd: session.sessionEnd,
          adults: booking.adults,
          children: booking.children,
          seniors: 0,
        })

        // --- 7. Décrément de la capacité (seulement si on arrive jusqu'ici) ---
        await tx
          .update(catalogActivitySessions)
          .set({ booked: session.booked + paxCount })
          .where(eq(catalogActivitySessions.id, session.id))

        await tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: reservationId,
          action: "activity_booking.created",
          diff: { activityId: booking.activityId, sessionId: booking.sessionId, paxCount, totalTnd, publicRef, via: "b2c_guest", paymentMethod },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          status: (isImmediatelyPaid ? "confirmed" : "pending") as "confirmed" | "pending",
        }
      },
    )

    // NB : pas d'événement Inngest de confirmation ici, même raison que
    // Packages (lib/packages/booking-actions.ts) — le template hôtel ne
    // s'applique pas à une attraction. Voucher réel via
    // `/api/activities/voucher/[ref]`.

    if (result.status === "confirmed") {
      try {
        const invoiceResult = await generateInvoiceForReservation({
          agencyId,
          reservationId: result.reservationId,
          actorUserId: "",
        })
        if (!invoiceResult.ok) {
          console.error("[activity-guest] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error("[activity-guest] génération facture échouée", err instanceof Error ? err.message : String(err))
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
      ACTIVITY_NOT_FOUND: "Attraction introuvable",
      ACTIVITY_NOT_ACTIVE: "Cette attraction n'est plus disponible",
      CHILD_AGE_INVALID: msg.match(/CHILD_AGE_INVALID: (.+)/)?.[1] ?? "Âge enfant invalide pour cette attraction",
      SESSION_NOT_FOUND: "Session introuvable pour cette attraction",
      SESSION_NOT_OPEN: "Cette session n'est plus ouverte à la réservation",
      BOOKING_DEADLINE_PASSED: "La date limite de réservation pour cette session est dépassée",
      INSUFFICIENT_STOCK: msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Places insuffisantes",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return { ok: false, error: code ? codes[code] : "Erreur interne lors de la création de la réservation.", code: code ?? "INTERNAL_ERROR" }
  }
}

async function nextActivityPublicRef(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `AT-${year}-`
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
