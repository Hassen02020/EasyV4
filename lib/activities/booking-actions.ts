"use server"

/**
 * Réservation Attractions B2B — Phase 13.1, gap #1 + gap #2.
 *
 * Même modèle que `lib/omra/booking-actions.ts::createOmraBooking` (le
 * chemin B2B déjà validé, Phase 11) : session partenaire résolue via
 * `resolveSessionContext()`, débit du compte de dépôt de l'agence via
 * `debitPartnerCredit`, verrou `FOR UPDATE` contre le surbooking, prix
 * 100% serveur. Pas de marge appliquée ici — délibérément, pour rester
 * cohérent avec `createOmraBooking` (qui n'en applique pas non plus) :
 * appliquer `getMarginsForAgency`/`applyMargin` (module "activity", déjà
 * supporté par `lib/pro/pricing.ts` depuis Phase 9) à ces 3 nouveaux
 * moteurs de réservation Phase 13/13.1 est un gap documenté dans le
 * rapport, pas silencieusement résolu ici pour ne pas modifier le
 * comportement d'un chemin B2B déjà audité (`createOmraBooking`).
 *
 * Lecture du produit : PAS de filtre `agencyId` explicite dans la requête
 * — comme `createOmraBooking`, on compte entièrement sur RLS
 * (`catalog_activities_tenant_isolation`, élargie en 0023_commerce_completion.sql
 * pour inclure les autorisations `product_authorizations`) pour décider si
 * l'agence courante peut voir ce produit. C'est le verrou réel derrière le
 * gap B2B — voir le commentaire de tête de la migration.
 */

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationActivity,
  customers,
  auditEvents,
  catalogActivities,
  catalogActivitySessions,
  payments,
} from "@/lib/db/schema"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { computePriceBreakdown } from "@/lib/booking/pricing"
import {
  activityPartnerBookingSchema,
  validateChildAgesAgainstTariffRules,
  type ActivityPartnerBookingInput,
} from "./schemas"

export type CreateActivityBookingResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: string }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

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

export async function createActivityBooking(
  input: ActivityPartnerBookingInput,
): Promise<CreateActivityBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = activityPartnerBookingSchema.safeParse(input)
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
        // --- 1. Attraction (RLS décide si cette agence peut la voir : propriétaire OU autorisée) ---
        const [activity] = await tx
          .select()
          .from(catalogActivities)
          .where(eq(catalogActivities.id, booking.activityId))
          .limit(1)
        if (!activity) throw new Error("ACTIVITY_NOT_FOUND")
        if (activity.status !== "published") throw new Error("ACTIVITY_NOT_ACTIVE")
        if (!activity.channels?.includes("b2b")) throw new Error("ACTIVITY_NOT_ACTIVE")

        const ageError = validateChildAgesAgainstTariffRules(activity.tariffRules, booking.childrenAges)
        if (ageError) throw new Error(`CHILD_AGE_INVALID: ${ageError}`)

        // --- 2. Session (verrou FOR UPDATE) ---
        const [activitySession] = await tx
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
        if (!activitySession) throw new Error("SESSION_NOT_FOUND")
        if (activitySession.status !== "open") throw new Error("SESSION_NOT_OPEN")
        if (isPastBookingDeadline(activitySession)) throw new Error("BOOKING_DEADLINE_PASSED")

        const capacityLeft = activitySession.capacity - activitySession.booked
        if (capacityLeft < paxCount) {
          throw new Error(`INSUFFICIENT_STOCK: ${capacityLeft} places disponibles, ${paxCount} demandées`)
        }

        // --- 3. Prix (100% serveur, aucune marge appliquée — voir commentaire de tête) ---
        const unitPriceTnd = parseFloat(activitySession.adultPriceTnd)
        const unitChildPriceTnd = activitySession.childPriceTnd
          ? parseFloat(activitySession.childPriceTnd)
          : undefined
        const breakdown = computePriceBreakdown({
          unitPriceTnd,
          adults: booking.adults,
          children: booking.children,
          unitChildPriceTnd,
          depositPercent: 100,
        })
        const totalTnd = breakdown.totalTnd

        // --- 4. Client ---
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
              channel: "b2b",
            },
          })
          .returning({ id: reservations.id })
        const reservationId = reservation.id

        // --- 6. Débit crédit agence (même transaction, pas de tx imbriquée) ---
        const debitResult = await debitPartnerCredit({
          agencyId,
          amountTnd: totalTnd,
          reference: publicRef,
          description: `Réservation Attraction — ${activity.title}`,
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

        // --- 7. Extension Activity ---
        await tx.insert(reservationActivity).values({
          reservationId,
          agencyId,
          activityId: booking.activityId,
          sessionId: booking.sessionId,
          sessionDate: activitySession.sessionDate,
          sessionStart: activitySession.sessionStart,
          sessionEnd: activitySession.sessionEnd,
          adults: booking.adults,
          children: booking.children,
          seniors: 0,
        })

        // --- 8. Décrément de la capacité ---
        await tx
          .update(catalogActivitySessions)
          .set({ booked: activitySession.booked + paxCount })
          .where(eq(catalogActivitySessions.id, activitySession.id))

        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: createdByUserId,
          entityType: "reservation",
          entityId: reservationId,
          action: "activity_booking.created",
          diff: { activityId: booking.activityId, sessionId: booking.sessionId, paxCount, totalTnd, publicRef, via: "b2b" },
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
        console.error("[activity-b2b] génération facture échouée", invoiceResult.error)
      }
    } catch (err) {
      console.error("[activity-b2b] génération facture échouée", err instanceof Error ? err.message : String(err))
    }

    return { ok: true, reservationId: result.reservationId, publicRef: result.publicRef }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      ACTIVITY_NOT_FOUND: "Attraction introuvable ou non autorisée pour votre agence",
      ACTIVITY_NOT_ACTIVE: "Cette attraction n'est plus disponible en B2B",
      CHILD_AGE_INVALID: msg.match(/CHILD_AGE_INVALID: (.+)/)?.[1] ?? "Âge enfant invalide pour cette attraction",
      SESSION_NOT_FOUND: "Session introuvable pour cette attraction",
      SESSION_NOT_OPEN: "Cette session n'est plus ouverte à la réservation",
      BOOKING_DEADLINE_PASSED: "La date limite de réservation pour cette session est dépassée",
      INSUFFICIENT_STOCK: msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Places insuffisantes",
      INSUFFICIENT_BALANCE: "Solde wallet insuffisant",
      WALLET_DEBIT_FAILED: "Erreur lors du débit wallet",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return { ok: false, error: code ? codes[code] : `Erreur interne: ${msg}`, code: code ?? "INTERNAL_ERROR" }
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
