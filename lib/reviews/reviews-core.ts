/**
 * Avis clients — moteur central, pas un fichier `"use server"` (même
 * discipline que lib/crm/leads-core.ts / lib/favorites/favorites-core.ts).
 *
 * Un avis n'existe QUE rattaché à une réservation réelle, déjà possédée
 * par le client (même prédicat `ownedByCurrentCustomer` que
 * listMyReservations), déjà confirmée/complétée (jamais un avis sur une
 * réservation en attente ou annulée), et jamais deux fois pour la même
 * réservation (contrainte unique reservationId — vérifiée AVANT l'insert,
 * la contrainte reste le filet de sécurité final contre une course
 * concurrente, même discipline que convertLeadCore).
 *
 * La lecture PUBLIQUE (listApprovedReviewsForProductCore) ne renvoie
 * JAMAIS un avis dont le statut n'est pas 'approved' — c'est la seule
 * garde de visibilité, RLS ne gérant que l'isolation tenant.
 */

import { and, avg, count, desc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reviews,
  reservations,
  reservationHotel,
  reservationPackage,
  reservationActivity,
  reservationOmra,
  customers,
} from "@/lib/db/schema"
import { ownedByCurrentCustomer } from "@/lib/booking/customer-identity"

export const REVIEW_MODULES = ["hotel", "omra", "package", "activity"] as const
export type ReviewModule = (typeof REVIEW_MODULES)[number]

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** Seuls ces statuts de réservation autorisent un avis — jamais sur une réservation en attente/annulée. */
const REVIEWABLE_RESERVATION_STATUSES = ["confirmed", "completed"] as const

export interface ReviewRow {
  id: string
  reservationId: string
  customerId: string
  module: ReviewModule
  productRef: string
  rating: number
  comment: string | null
  status: ReviewStatus
  moderatedByUserId: string | null
  moderatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function toReviewRow(r: typeof reviews.$inferSelect): ReviewRow {
  return { ...r, module: r.module as ReviewModule, status: r.status as ReviewStatus }
}

export type SubmitReviewResult =
  | { ok: true; id: string }
  | {
      ok: false
      code: "RESERVATION_NOT_FOUND" | "NOT_ELIGIBLE" | "ALREADY_REVIEWED"
      error: string
    }

/**
 * Résout module + référence produit d'une réservation à partir de sa
 * table d'extension — une seule requête par module possible (schéma
 * polymorphe, pas de jointure générique).
 */
async function resolveProductRef(
  tx: DrizzleTransaction,
  reservationId: string,
  module: string,
): Promise<string | null> {
  switch (module) {
    case "hotel": {
      const [row] = await tx
        .select({ hotelId: reservationHotel.hotelId })
        .from(reservationHotel)
        .where(eq(reservationHotel.reservationId, reservationId))
        .limit(1)
      return row ? String(row.hotelId) : null
    }
    case "package": {
      const [row] = await tx
        .select({ packageId: reservationPackage.packageId })
        .from(reservationPackage)
        .where(eq(reservationPackage.reservationId, reservationId))
        .limit(1)
      return row?.packageId ?? null
    }
    case "activity": {
      const [row] = await tx
        .select({ activityId: reservationActivity.activityId })
        .from(reservationActivity)
        .where(eq(reservationActivity.reservationId, reservationId))
        .limit(1)
      return row?.activityId ?? null
    }
    case "omra": {
      const [row] = await tx
        .select({ omraPackageId: reservationOmra.omraPackageId })
        .from(reservationOmra)
        .where(eq(reservationOmra.reservationId, reservationId))
        .limit(1)
      return row?.omraPackageId ?? null
    }
    default:
      return null
  }
}

export async function submitReviewCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    reservationId: string
    authUserId: string
    verifiedEmail: string
    rating: number
    comment: string | null
  },
): Promise<SubmitReviewResult> {
  const [reservation] = await tx
    .select({
      id: reservations.id,
      customerId: reservations.customerId,
      module: reservations.module,
      status: reservations.status,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(
      and(
        eq(reservations.id, params.reservationId),
        eq(reservations.agencyId, params.agencyId),
        ownedByCurrentCustomer({
          agencyId: params.agencyId,
          authUserId: params.authUserId,
          verifiedEmail: params.verifiedEmail,
        }),
      ),
    )
    .limit(1)

  if (!reservation) {
    return { ok: false, code: "RESERVATION_NOT_FOUND", error: "Réservation introuvable." }
  }
  if (
    !(REVIEW_MODULES as readonly string[]).includes(reservation.module) ||
    !(REVIEWABLE_RESERVATION_STATUSES as readonly string[]).includes(reservation.status)
  ) {
    return {
      ok: false,
      code: "NOT_ELIGIBLE",
      error: "Cette réservation n'est pas éligible à un avis (module ou statut non pris en charge).",
    }
  }

  // Vérifié AVANT l'insert plutôt qu'en catchant la violation de
  // reviews_reservation_id_uniq — même raisonnement que convertLeadCore
  // (Postgres abandonne le reste de la transaction dès qu'une contrainte
  // échoue). La contrainte reste le filet de sécurité final.
  const [existing] = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.reservationId, params.reservationId))
    .limit(1)
  if (existing) {
    return { ok: false, code: "ALREADY_REVIEWED", error: "Vous avez déjà laissé un avis pour cette réservation." }
  }

  const productRef = await resolveProductRef(tx, params.reservationId, reservation.module)
  if (!productRef) {
    return { ok: false, code: "NOT_ELIGIBLE", error: "Produit introuvable pour cette réservation." }
  }

  const [inserted] = await tx
    .insert(reviews)
    .values({
      agencyId: params.agencyId,
      reservationId: params.reservationId,
      customerId: reservation.customerId,
      module: reservation.module,
      productRef,
      rating: params.rating,
      comment: params.comment ?? undefined,
    })
    .returning({ id: reviews.id })

  return { ok: true, id: inserted!.id }
}

export interface PublicReviewRow {
  id: string
  rating: number
  comment: string | null
  createdAt: Date
  /** Prénom + initiale du nom — jamais l'email/téléphone, jamais le nom complet. */
  reviewerDisplayName: string
}

export interface ProductReviewSummary {
  average: number
  count: number
  reviews: PublicReviewRow[]
}

/**
 * Lecture PUBLIQUE — appelée via withSystemContext() par les pages produit
 * (même pattern que getBookableActivity/getDefaultAgencyId ailleurs :
 * trafic anonyme, filtre agencyId explicite dans la requête). Ne renvoie
 * JAMAIS un avis non approuvé, quel que soit l'appelant. Le nom affiché
 * est réduit à "Prénom N." — jamais l'email/téléphone/nom complet.
 */
export async function listApprovedReviewsForProductCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; module: ReviewModule; productRef: string; limit?: number },
): Promise<ProductReviewSummary> {
  const whereClause = and(
    eq(reviews.agencyId, params.agencyId),
    eq(reviews.module, params.module),
    eq(reviews.productRef, params.productRef),
    eq(reviews.status, "approved"),
  )

  const [stats] = await tx
    .select({ average: avg(reviews.rating), count: count(reviews.id) })
    .from(reviews)
    .where(whereClause)

  const rows = await tx
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(reviews)
    .innerJoin(customers, eq(customers.id, reviews.customerId))
    .where(whereClause)
    .orderBy(desc(reviews.createdAt))
    .limit(params.limit ?? 20)

  return {
    average: stats?.average ? Math.round(Number(stats.average) * 10) / 10 : 0,
    count: stats?.count ?? 0,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerDisplayName: `${r.firstName} ${r.lastName?.charAt(0) ?? ""}.`.trim(),
    })),
  }
}

/** Lecture staff — toute file de modération, tous statuts. */
export async function listReviewsForModerationCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; status?: ReviewStatus },
): Promise<ReviewRow[]> {
  const rows = await tx
    .select()
    .from(reviews)
    .where(
      params.status
        ? and(eq(reviews.agencyId, params.agencyId), eq(reviews.status, params.status))
        : eq(reviews.agencyId, params.agencyId),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(200)
  return rows.map(toReviewRow)
}

export async function moderateReviewCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; id: string; status: Exclude<ReviewStatus, "pending">; moderatedByUserId: string },
): Promise<{ updated: boolean }> {
  const updated = await tx
    .update(reviews)
    .set({
      status: params.status,
      moderatedByUserId: params.moderatedByUserId,
      moderatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(reviews.id, params.id), eq(reviews.agencyId, params.agencyId)))
    .returning({ id: reviews.id })
  return { updated: updated.length > 0 }
}
