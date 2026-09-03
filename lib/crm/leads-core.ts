/**
 * CRM / Leads — moteur central, PAS un fichier `"use server"` (même leçon
 * Phase 38A que lib/loyalty/rewards-core.ts et lib/favorites/favorites-core.ts).
 * Chaque fonction reçoit `agencyId` déjà résolu par l'appelant — testable
 * directement contre une vraie transaction DB.
 */

import { and, desc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads } from "@/lib/db/schema"

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

export async function updateLeadStatusCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    id: string
    status: LeadStatus
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
