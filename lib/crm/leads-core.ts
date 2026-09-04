/**
 * CRM / Leads — moteur central, PAS un fichier `"use server"` (même leçon
 * Phase 38A que lib/loyalty/rewards-core.ts et lib/favorites/favorites-core.ts).
 * Chaque fonction reçoit `agencyId` déjà résolu par l'appelant — testable
 * directement contre une vraie transaction DB.
 */

import { and, eq, desc, ilike, or } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers, leads, reservations } from "@/lib/db/schema"

export const LEAD_PRODUCT_TYPES = ["hotel", "omra", "package", "activity", "general"] as const
export type LeadProductType = (typeof LEAD_PRODUCT_TYPES)[number]

export const LEAD_STATUSES = ["new", "contacted", "converted", "closed"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export interface LeadRow {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  message: string | null
  productType: LeadProductType
  productRef: string | null
  productLabel: string | null
  sourcePage: string
  status: LeadStatus
  staffNotes: string | null
  handledByUserId: string | null
  reservationId: string | null
  convertedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function createLeadCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    firstName: string
    lastName?: string | null
    email?: string | null
    phone?: string | null
    message?: string | null
    productType: LeadProductType
    productRef?: string | null
    productLabel?: string | null
    sourcePage: string
  },
): Promise<{ id: string }> {
  const [inserted] = await tx
    .insert(leads)
    .values({
      agencyId: params.agencyId,
      firstName: params.firstName,
      lastName: params.lastName ?? undefined,
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
      message: params.message ?? undefined,
      productType: params.productType,
      productRef: params.productRef ?? undefined,
      productLabel: params.productLabel ?? undefined,
      sourcePage: params.sourcePage,
    })
    .returning({ id: leads.id })
  return { id: inserted!.id }
}

/**
 * Les 200 leads les plus récents de l'agence — pas de pagination cursor
 * (volume attendu bien en-deçà, contrairement aux réservations) ; à revoir
 * si le volume réel le justifie un jour.
 */
export async function listLeadsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; status?: LeadStatus },
): Promise<LeadRow[]> {
  const rows = await tx
    .select()
    .from(leads)
    .where(
      params.status
        ? and(eq(leads.agencyId, params.agencyId), eq(leads.status, params.status))
        : eq(leads.agencyId, params.agencyId),
    )
    .orderBy(desc(leads.createdAt))
    .limit(200)

  return rows.map((r) => ({
    ...r,
    productType: r.productType as LeadProductType,
    status: r.status as LeadStatus,
  }))
}

/**
 * `status: "converted"` est délibérément REFUSÉ ici — un lead ne peut être
 * marqué converti qu'en le liant à une réservation réelle, voir
 * `convertLeadCore` ci-dessous. Défense en profondeur : la contrainte CHECK
 * `leads_converted_requires_reservation` (0043) refuserait de toute façon
 * l'écriture au niveau DB, mais on préfère échouer tôt avec un message
 * exploitable côté action plutôt qu'une erreur SQL brute.
 */
export async function updateLeadStatusCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    id: string
    status: Exclude<LeadStatus, "converted">
    staffNotes?: string | null
    handledByUserId: string
  },
): Promise<{ updated: boolean }> {
  const updated = await tx
    .update(leads)
    .set({
      status: params.status,
      staffNotes: params.staffNotes ?? undefined,
      handledByUserId: params.handledByUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, params.id), eq(leads.agencyId, params.agencyId)))
    .returning({ id: leads.id })

  return { updated: updated.length > 0 }
}

export type ConvertLeadResult =
  | { ok: true }
  | { ok: false; code: "LEAD_NOT_FOUND" | "RESERVATION_NOT_FOUND" | "RESERVATION_ALREADY_LINKED"; error: string }

/**
 * Marque un lead comme converti EN LE LIANT à une réservation réelle de la
 * MÊME agence — jamais un simple changement de statut déclaratif (voir
 * commentaire de tête de fichier + audit CRM qui a trouvé ce gap : "converted"
 * était un label posé sans aucune preuve). `reservationId` est vérifié sous
 * le contexte tenant de l'appelant (RLS `reservations_tenant_isolation`) :
 * si la réservation appartient à une autre agence, le SELECT ne la trouve
 * simplement pas — jamais de comparaison manuelle d'agencyId à contourner.
 */
export async function convertLeadCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    id: string
    reservationId: string
    staffNotes?: string | null
    handledByUserId: string
  },
): Promise<ConvertLeadResult> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, params.id), eq(leads.agencyId, params.agencyId)))
    .limit(1)
  if (!lead) {
    return { ok: false, code: "LEAD_NOT_FOUND", error: "Demande introuvable." }
  }

  const [reservation] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.id, params.reservationId), eq(reservations.agencyId, params.agencyId)))
    .limit(1)
  if (!reservation) {
    return {
      ok: false,
      code: "RESERVATION_NOT_FOUND",
      error: "Réservation introuvable pour cette agence.",
    }
  }

  // Vérifié AVANT l'update plutôt qu'en catchant la violation de
  // `leads_reservation_id_uniq` (0043) : Postgres abandonne le reste de la
  // transaction dès qu'une contrainte échoue — un catch JS qui avale
  // l'erreur puis tente de committer la transaction rencontrerait la même
  // erreur au COMMIT. La contrainte UNIQUE reste le filet de sécurité final
  // contre une vraie course concurrente (deux conversions simultanées),
  // jamais retiré — seulement plus la voie normale ici.
  const [existingLink] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.reservationId, params.reservationId), eq(leads.agencyId, params.agencyId)))
    .limit(1)
  if (existingLink && existingLink.id !== params.id) {
    return {
      ok: false,
      code: "RESERVATION_ALREADY_LINKED",
      error: "Cette réservation est déjà liée à une autre demande.",
    }
  }

  await tx
    .update(leads)
    .set({
      status: "converted",
      reservationId: params.reservationId,
      convertedAt: new Date(),
      staffNotes: params.staffNotes ?? undefined,
      handledByUserId: params.handledByUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, params.id), eq(leads.agencyId, params.agencyId)))

  return { ok: true }
}

export interface ReservationLinkCandidate {
  id: string
  publicRef: string
  module: string
  status: string
  tndAmount: string
  createdAt: Date
  customerFirstName: string
  customerLastName: string
  customerEmail: string | null
  customerPhone: string | null
}

/**
 * Réservations candidates pour lier un lead — jamais un lien automatique :
 * le staff choisit toujours explicitement dans cette liste (voir
 * `convertLeadCore`). Sans `query`, suggère par correspondance email/
 * téléphone du lead (le cas le plus courant) ; avec `query`, recherche
 * libre (réf publique, nom, email, téléphone) pour couvrir le cas où le
 * client a réservé avec des coordonnées différentes de celles du lead.
 * Toujours scopé à `agencyId` — jamais de résultat cross-agence.
 */
export async function searchReservationsForLeadLinkCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; email?: string | null; phone?: string | null; query?: string },
): Promise<ReservationLinkCandidate[]> {
  const q = params.query?.trim()

  const matchClause = q
    ? or(
        ilike(reservations.publicRef, `%${q}%`),
        ilike(customers.firstName, `%${q}%`),
        ilike(customers.lastName, `%${q}%`),
        ilike(customers.email, `%${q}%`),
        ilike(customers.phone, `%${q}%`),
      )
    : or(
        params.email ? eq(customers.email, params.email) : undefined,
        params.phone ? eq(customers.phone, params.phone) : undefined,
      )

  // Ni query, ni email, ni phone : rien de pertinent à suggérer — jamais une
  // liste arbitraire des dernières réservations de l'agence.
  if (!matchClause) return []

  const rows = await tx
    .select({
      id: reservations.id,
      publicRef: reservations.publicRef,
      module: reservations.module,
      status: reservations.status,
      tndAmount: reservations.tndAmount,
      createdAt: reservations.createdAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(and(eq(reservations.agencyId, params.agencyId), matchClause))
    .orderBy(desc(reservations.createdAt))
    .limit(q ? 20 : 10)

  return rows
}
