"use server"

import { redirect } from "next/navigation"
import { eq, desc, and, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  customers,
  reservations,
  reservationHotel,
  auditEvents,
} from "@/lib/db/schema"
import type { BookingDraft, TravelerInput } from "./schemas"
import { bookingDraftSchema, travelerSchemaWithIdRule } from "./schemas"
import { computePriceBreakdown } from "./pricing"
import { decodeDraft } from "./draft-store"
import { walletDebitReservation } from "@/lib/wallet/actions"
import { inngest } from "@/lib/inngest/client"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  db: ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  // MAX() sur les refs du préfixe courant — atomique dans la transaction parente
  // élimine la race condition du scan-50-lignes précédent
  const [row] = await (db as ReturnType<typeof getDb>)
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

export type CreateReservationResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string }

export async function createReservationFromDraft(input: {
  draft: BookingDraft
  traveler: TravelerInput
}): Promise<CreateReservationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  // Résoudre l'agencyId depuis la session authentifiée — jamais hardcodé
  let agencyId: string
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }
    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) return { ok: false, error: "Profil partenaire introuvable" }
    agencyId = profile.agency.id
  } catch {
    return { ok: false, error: "Erreur d'authentification" }
  }

  const draftParse = bookingDraftSchema.safeParse(input.draft)
  if (!draftParse.success) {
    return {
      ok: false,
      error:
        "Brouillon invalide : " +
        draftParse.error.errors.map((e) => e.message).join(", "),
    }
  }
  const travelerParse = travelerSchemaWithIdRule.safeParse(input.traveler)
  if (!travelerParse.success) {
    return {
      ok: false,
      error:
        "Voyageur invalide : " +
        travelerParse.error.errors.map((e) => e.message).join(", "),
    }
  }

  const draft = draftParse.data
  const traveler = travelerParse.data
  const breakdown = computePriceBreakdown({
    unitPriceTnd: draft.unitPriceTnd,
    adults: draft.adults,
    children: draft.children,
    unitChildPriceTnd: draft.unitChildPriceTnd,
  })

  const db = getDb()

  try {
    const result = await db.transaction(async (tx) => {
      // --- Résoudre ou créer le client ---
      let customerId: string
      if (traveler.email) {
        const existing = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.agencyId, agencyId),
              eq(customers.email, traveler.email),
            ),
          )
          .limit(1)
        if (existing[0]) {
          customerId = existing[0].id
        } else {
          const inserted = await tx
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
              birthDate: traveler.birthDate || null,
              nationality: traveler.nationality || null,
            })
            .returning({ id: customers.id })
          customerId = inserted[0].id
        }
      } else {
        const inserted = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: traveler.civility,
            firstName: traveler.firstName,
            lastName: traveler.lastName,
            phone: traveler.phone,
            civicId: traveler.civicId,
            civicIdType: traveler.civicIdType,
          })
          .returning({ id: customers.id })
        customerId = inserted[0].id
      }

      const publicRef = await nextPublicRef(tx, agencyId)

      const inserted = await tx
        .insert(reservations)
        .values({
          agencyId,
          publicRef,
          customerId,
          module: draft.module,
          source: "internal",
          status: "pending",
          originalCurrency: draft.currency,
          originalAmount: String(breakdown.totalTnd),
          tndAmount: String(breakdown.totalTnd),
          depositAmount: String(breakdown.depositTnd),
          depositPaid: "0",
          providerPayload: {
            offerId: draft.offerId,
            offerLabel: draft.offerLabel,
            startDate: draft.startDate,
            endDate: draft.endDate,
            adults: draft.adults,
            children: draft.children,
            breakdown,
            metadata: draft.metadata ?? null,
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })
      const reservationId = inserted[0].id

      if (draft.module === "hotel") {
        const startDate = new Date(draft.startDate)
        const endDate = draft.endDate ? new Date(draft.endDate) : startDate
        const nights = Math.max(
          1,
          Math.round(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
        await tx.insert(reservationHotel).values({
          reservationId,
          agencyId,
          hotelId: Number(draft.offerId) || 0,
          hotelName: draft.offerLabel,
          checkIn: draft.startDate,
          checkOut: draft.endDate ?? draft.startDate,
          nights,
          adults: draft.adults,
          childrenAges: [],
        })
      }

      await tx.insert(auditEvents).values({
        agencyId,
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservationId,
        diff: {
          module: draft.module,
          publicRef,
          total: breakdown.totalTnd,
          via: "front-office",
        },
      })

      // --- Débit wallet — dans la transaction : rollback total si insuffisant ---
      const debitResult = await walletDebitReservation({
        agencyId,
        reservationId,
        amountTnd: breakdown.totalTnd,
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_BALANCE"
            ? `INSUFFICIENT_BALANCE:${breakdown.totalTnd.toFixed(3)}`
            : `WALLET_ERROR:${debitResult.error}`,
        )
      }

      return { reservationId, publicRef, agencyId }
    })

    // --- Événement Inngest (hors transaction, fire-and-forget) ---
    // PII sanitizé : on n'envoie que les références opaques, pas les données voyageur
    inngest.send({
      name: "booking/confirmed",
      data: {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId: result.agencyId,
        customerId: result.reservationId, // référence opaque
        module: draft.module,
        totalTnd: breakdown.totalTnd,
      },
    }).catch(() => { /* fire-and-forget — le retry Inngest suffira */ })

    return { ok: true, reservationId: result.reservationId, publicRef: result.publicRef }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith("INSUFFICIENT_BALANCE:")) {
      const amount = msg.split(":")[1]
      return {
        ok: false,
        error: `Solde insuffisant — il vous faut ${amount} DT. Rechargez votre wallet puis réessayez.`,
      }
    }
    if (msg.startsWith("WALLET_ERROR:")) {
      return { ok: false, error: msg.split(":")[1] ?? "Erreur wallet" }
    }
    return { ok: false, error: "Erreur interne lors de la création de la réservation" }
  }
}

export async function submitCheckoutAction(formData: FormData): Promise<void> {
  const token = String(formData.get("draft") ?? "")
  if (!token) {
    throw new Error("Brouillon manquant")
  }
  const payload = decodeDraft(token)
  if (!payload || !payload.traveler) {
    throw new Error("Brouillon invalide ou incomplet")
  }
  const result = await createReservationFromDraft({
    draft: payload.draft,
    traveler: payload.traveler,
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  redirect(`/booking/confirmation/${result.publicRef}`)
}
