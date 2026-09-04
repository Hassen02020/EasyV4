"use server"

/**
 * CRM / Leads — gestion staff (`/admin/support`, fixe un lien de nav mort :
 * "Support & Clients" pointait vers /admin/support, qui n'a jamais existé).
 *
 * Même patron que lib/admin/product-guard.ts::assertProductManager, avec un
 * jeu de rôles distinct : suivre les demandes de contact est une tâche
 * courante d'agent réservation, pas réservée aux managers (contrairement à
 * la gestion catalogue) — mêmes 3 rôles que la file de validations
 * (app/admin/validations/page.tsx) et que "Support & Clients" dans la nav
 * (components/admin-shell.tsx::managerNavItems, index visible par
 * super_admin/manager/agent_resa).
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  listLeadsCore,
  updateLeadStatusCore,
  convertLeadCore,
  searchReservationsForLeadLinkCore,
  LEAD_STATUSES,
  type LeadRow,
  type LeadStatus,
  type ReservationLinkCandidate,
} from "@/lib/crm/leads-core"

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const

interface SupportStaffContext {
  userId: string
  agencyId: string
}

async function assertSupportStaff(): Promise<SupportStaffContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (!(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? "")) {
    throw new Error("FORBIDDEN")
  }
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

export type ListLeadsResult = { ok: true; leads: LeadRow[] } | { ok: false; error: string }

export async function listLeads(status?: LeadStatus): Promise<ListLeadsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      listLeadsCore(tx, { agencyId: ctx.agencyId, status }),
    )
    return { ok: true, leads: rows }
  } catch (err) {
    console.error("[listLeads]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type UpdateLeadStatusResult = { ok: true } | { ok: false; error: string }

export async function updateLeadStatus(input: {
  id: string
  status: LeadStatus
  staffNotes?: string
}): Promise<UpdateLeadStatusResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  if (!(LEAD_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Statut invalide." }
  }
  if (!input.id || typeof input.id !== "string") {
    return { ok: false, error: "Identifiant invalide." }
  }
  // "converted" exige une réservation liée — voir convertLead() ci-dessous.
  // Jamais un simple changement de statut déclaratif (audit CRM : c'était
  // exactement ce défaut avant la migration 0043).
  if (input.status === "converted") {
    return {
      ok: false,
      error: "Utilisez « Lier à une réservation » pour marquer une demande comme convertie.",
    }
  }
  const status = input.status

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        updateLeadStatusCore(tx, {
          agencyId: ctx.agencyId,
          id: input.id,
          status,
          staffNotes: input.staffNotes,
          handledByUserId: ctx.userId,
        }),
    )
    if (!result.updated) return { ok: false, error: "Demande introuvable." }
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (err) {
    console.error("[updateLeadStatus]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type ConvertLeadActionResult = { ok: true } | { ok: false; error: string }

export async function convertLead(input: {
  id: string
  reservationId: string
  staffNotes?: string
}): Promise<ConvertLeadActionResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  if (!input.id || !input.reservationId) {
    return { ok: false, error: "Identifiant invalide." }
  }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        convertLeadCore(tx, {
          agencyId: ctx.agencyId,
          id: input.id,
          reservationId: input.reservationId,
          staffNotes: input.staffNotes,
          handledByUserId: ctx.userId,
        }),
    )
    if (!result.ok) return { ok: false, error: result.error }
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (err) {
    console.error("[convertLead]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type SearchReservationsForLeadLinkResult =
  | { ok: true; reservations: ReservationLinkCandidate[] }
  | { ok: false; error: string }

/**
 * Candidats de réservation pour lier un lead donné. Sans `query`, suggère
 * par correspondance email/téléphone du lead ; avec `query`, recherche
 * libre — voir searchReservationsForLeadLinkCore.
 */
export async function searchReservationsForLeadLink(input: {
  leadId: string
  query?: string
}): Promise<SearchReservationsForLeadLinkResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  if (!input.leadId) return { ok: false, error: "Identifiant invalide." }

  try {
    const rows = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const leadRows = await listLeadsCore(tx, { agencyId: ctx.agencyId })
        const lead = leadRows.find((l) => l.id === input.leadId)
        if (!lead) return null
        return searchReservationsForLeadLinkCore(tx, {
          agencyId: ctx.agencyId,
          email: lead.email,
          phone: lead.phone,
          query: input.query,
        })
      },
    )
    if (rows === null) return { ok: false, error: "Demande introuvable." }
    return { ok: true, reservations: rows }
  } catch (err) {
    console.error("[searchReservationsForLeadLink]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

