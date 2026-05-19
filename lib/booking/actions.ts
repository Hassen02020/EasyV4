"use server"

import { redirect } from "next/navigation"
import { eq, desc, and } from "drizzle-orm"
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

const AGENCY_ID = "00000000-0000-0000-0000-000000000001"

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  db: ReturnType<typeof getDb>,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  const rows = await db
    .select({ publicRef: reservations.publicRef })
    .from(reservations)
    .where(eq(reservations.agencyId, agencyId))
    .orderBy(desc(reservations.createdAt))
    .limit(50)

  let max = 0
  for (const r of rows) {
    if (r.publicRef.startsWith(prefix)) {
      const n = Number(r.publicRef.slice(prefix.length))
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `${prefix}${pad(max + 1)}`
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

  let customerId: string
  if (traveler.email) {
    const existing = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.agencyId, AGENCY_ID),
          eq(customers.email, traveler.email),
        ),
      )
      .limit(1)
    if (existing[0]) {
      customerId = existing[0].id
    } else {
      const inserted = await db
        .insert(customers)
        .values({
          agencyId: AGENCY_ID,
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
    const inserted = await db
      .insert(customers)
      .values({
        agencyId: AGENCY_ID,
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

  const publicRef = await nextPublicRef(db, AGENCY_ID)

  const inserted = await db
    .insert(reservations)
    .values({
      agencyId: AGENCY_ID,
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
    await db.insert(reservationHotel).values({
      reservationId,
      agencyId: AGENCY_ID,
      hotelId: Number(draft.offerId) || 0,
      hotelName: draft.offerLabel,
      checkIn: draft.startDate,
      checkOut: draft.endDate ?? draft.startDate,
      nights,
      adults: draft.adults,
      childrenAges: [],
    })
  }

  await db.insert(auditEvents).values({
    agencyId: AGENCY_ID,
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

  return { ok: true, reservationId, publicRef }
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
