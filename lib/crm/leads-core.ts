/**
 * CRM / Leads — moteur central, PAS un fichier `"use server"` (même leçon
 * Phase 38A que lib/loyalty/rewards-core.ts et lib/favorites/favorites-core.ts).
 * Chaque fonction reçoit `agencyId` déjà résolu par l'appelant — testable
 * directement contre une vraie transaction DB.
 */

import { and, eq, desc, ilike, inArray, isNull, or } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers, leads, reservations } from "@/lib/db/schema"
import { findMatchingCustomerIdsCore } from "./customer-match-core"

export const LEAD_PRODUCT_TYPES = [
  "hotel",
  "omra",
  "package",
  "activity",
  "general",
] as const
export type LeadProductType = (typeof LEAD_PRODUCT_TYPES)[number]

/**
 * CRM-NICHE-01 — alignée sur la décision Devis permanente (2026-09-29,
 * ROADMAP Phase 3 R3-03) : "groupe", "transfert" et "a_la_carte" sont
 * exactement les 3 cas où un futur flux devis s'appliquera. "standard"
 * couvre tout le reste (défaut).
 */
export const LEAD_INTENTIONS = [
  "groupe",
  "transfert",
  "a_la_carte",
  "standard",
] as const
export type LeadIntention = (typeof LEAD_INTENTIONS)[number]

/**
 * CRM-NICHE-01 — marchés/marques Easy2Book actifs, pas un code pays ISO
 * générique. Une seule entité active aujourd'hui ; ajouter "usa"/"asia"
 * plus tard ne demande aucune migration (colonne texte, validée ici).
 */
export const LEAD_MARKETS = ["tunisia"] as const
export type LeadMarket = (typeof LEAD_MARKETS)[number]

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "converted",
  "closed",
] as const
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
  destination: string | null
  intention: LeadIntention
  market: LeadMarket
  /** NETWORK-DEMAND-CAPTURE-01 — colonnes résolues, jamais écrites directement (voir network-demand-capture-core.ts). */
  originAgencyId: string | null
  capturedByUserId: string | null
  channel: string | null
  campaignRef: string | null
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
    destination?: string | null
    intention?: LeadIntention
    market?: LeadMarket
    campaignRef?: string | null
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
      destination: params.destination ?? undefined,
      intention: params.intention ?? "standard",
      market: params.market ?? "tunisia",
      campaignRef: params.campaignRef ?? undefined,
    })
    .returning({ id: leads.id })
  return { id: inserted!.id }
}

export async function getLeadCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; id: string },
): Promise<LeadRow | null> {
  const [row] = await tx
    .select()
    .from(leads)
    .where(and(eq(leads.id, params.id), eq(leads.agencyId, params.agencyId)))
    .limit(1)
  if (!row) return null
  return {
    ...row,
    productType: row.productType as LeadProductType,
    intention: row.intention as LeadIntention,
    market: row.market as LeadMarket,
    status: row.status as LeadStatus,
  }
}

/**
 * Les 200 leads les plus récents de l'agence — pas de pagination cursor
 * (volume attendu bien en-deçà, contrairement aux réservations) ; à revoir
 * si le volume réel le justifie un jour.
 */
export async function listLeadsCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    status?: LeadStatus
  },
): Promise<LeadRow[]> {
  const conditions = [eq(leads.agencyId, params.agencyId)]
  if (params.status) conditions.push(eq(leads.status, params.status))

  const rows = await tx
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(200)

  return rows.map((r) => ({
    ...r,
    productType: r.productType as LeadProductType,
    intention: r.intention as LeadIntention,
    market: r.market as LeadMarket,
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

export async function updateLeadNotesCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    id: string
    staffNotes: string | null
  },
): Promise<{ updated: boolean }> {
  const updated = await tx
    .update(leads)
    .set({ staffNotes: params.staffNotes, updatedAt: new Date() })
    .where(and(eq(leads.id, params.id), eq(leads.agencyId, params.agencyId)))
    .returning({ id: leads.id })

  return { updated: updated.length > 0 }
}

export type ConvertLeadResult =
  | { ok: true }
  | {
      ok: false
      code:
        | "LEAD_NOT_FOUND"
        | "RESERVATION_NOT_FOUND"
        | "RESERVATION_ALREADY_LINKED"
      error: string
    }

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
    .where(
      and(
        eq(reservations.id, params.reservationId),
        eq(reservations.agencyId, params.agencyId),
      ),
    )
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
    .where(
      and(
        eq(leads.reservationId, params.reservationId),
        eq(leads.agencyId, params.agencyId),
      ),
    )
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

export type AutoConvertLeadOutcome =
  | { outcome: "converted"; leadId: string }
  | {
      outcome: "skipped"
      reason: "no_match" | "ambiguous" | "already_linked" | "no_criteria"
    }

/**
 * Conversion automatique (système) d'un lead sur confirmation de réservation.
 * Appelé par l'Inngest function `auto-convert-lead` sur `booking/confirmed`.
 *
 * Règles :
 *  - Correspond si email OU téléphone du client confirme un lead (new/contacted,
 *    sans reservationId déjà assigné) de la même agence.
 *  - Convertit uniquement si exactement 1 match sans ambiguïté.
 *  - En cas de 0 ou ≥2 matches : skip silencieux (conversion manuelle conservée).
 *  - Idempotent : si reservationId déjà lié → "already_linked" (pas d'erreur).
 *
 * Pas de `handledByUserId` : conversion système (null = automatique).
 */
export async function autoConvertLeadCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    reservationId: string
    customerEmail: string | null
    customerPhone: string | null
  },
): Promise<AutoConvertLeadOutcome> {
  const [alreadyLinked] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, params.agencyId),
        eq(leads.reservationId, params.reservationId),
      ),
    )
    .limit(1)
  if (alreadyLinked) return { outcome: "skipped", reason: "already_linked" }

  const emailClause = params.customerEmail
    ? eq(leads.email, params.customerEmail)
    : undefined
  const phoneClause = params.customerPhone
    ? eq(leads.phone, params.customerPhone)
    : undefined
  if (!emailClause && !phoneClause)
    return { outcome: "skipped", reason: "no_criteria" }

  const contactMatch =
    emailClause && phoneClause
      ? or(emailClause, phoneClause)
      : (emailClause ?? phoneClause)

  // Limit 3 to detect ambiguity without scanning the whole table
  const candidates = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, params.agencyId),
        or(eq(leads.status, "new"), eq(leads.status, "contacted")),
        isNull(leads.reservationId),
        contactMatch,
      ),
    )
    .limit(3)

  if (candidates.length === 0) return { outcome: "skipped", reason: "no_match" }
  if (candidates.length > 1) return { outcome: "skipped", reason: "ambiguous" }

  const leadId = candidates[0]!.id
  await tx
    .update(leads)
    .set({
      status: "converted",
      reservationId: params.reservationId,
      convertedAt: new Date(),
      handledByUserId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.agencyId, params.agencyId)))

  return { outcome: "converted", leadId }
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
 * `convertLeadCore`). Sans `query`, suggère par correspondance NORMALISÉE
 * email/téléphone du lead (le cas le plus courant — NORMALIZED-MATCHING-01,
 * même helper partagé que `getVipScoreForLeadCore`/`getCustomer360Core`) ;
 * avec `query`, recherche libre (réf publique, nom, email, téléphone, non
 * normalisée) pour couvrir le cas où le client a réservé avec des
 * coordonnées différentes de celles du lead. Toujours scopé à `agencyId`
 * — jamais de résultat cross-agence.
 */
export async function searchReservationsForLeadLinkCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    email?: string | null
    phone?: string | null
    query?: string
  },
): Promise<ReservationLinkCandidate[]> {
  const q = params.query?.trim()

  let matchClause
  if (q) {
    matchClause = or(
      ilike(reservations.publicRef, `%${q}%`),
      ilike(customers.firstName, `%${q}%`),
      ilike(customers.lastName, `%${q}%`),
      ilike(customers.email, `%${q}%`),
      ilike(customers.phone, `%${q}%`),
    )
  } else {
    const matchedCustomerIds = await findMatchingCustomerIdsCore(tx, {
      agencyId: params.agencyId,
      email: params.email,
      phone: params.phone,
    })
    matchClause = matchedCustomerIds.length
      ? inArray(reservations.customerId, matchedCustomerIds)
      : undefined
  }

  // Ni query, ni email, ni phone, ni aucun customer trouvé : rien de
  // pertinent à suggérer — jamais une liste arbitraire des dernières
  // réservations de l'agence.
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

/**
 * CAMPAIGN-LIFECYCLE-01 — restitution email/phone pour `launchCampaignCore`.
 * Seuls `id`, `email` et `phone` sont retournés (scope minimal, pas de données
 * personnelles superflues dans le contexte campagne).
 * Les IDs non trouvés ou hors agence sont silencieusement ignorés.
 */
export async function fetchLeadsByIdsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; ids: string[] },
): Promise<Pick<LeadRow, "id" | "email" | "phone">[]> {
  if (params.ids.length === 0) return []
  const rows = await tx
    .select({ id: leads.id, email: leads.email, phone: leads.phone })
    .from(leads)
    .where(
      and(eq(leads.agencyId, params.agencyId), inArray(leads.id, params.ids)),
    )
  return rows
}
