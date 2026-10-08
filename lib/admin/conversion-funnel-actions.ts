"use server"

/**
 * CONVERSION-FUNNEL-01 — "Peut-on relier la conversion à sa source ?"
 * (pilier 8 de la vision Easy2Book).
 *
 * Agrège la table `leads` par (channel, productType) et joint vers
 * `reservationFinancials` sur `leads.reservationId` pour les leads
 * `status='converted'` — CA et marge de la conversion, jamais
 * recalculés (FINANCIAL est l'unique propriétaire de cette vérité).
 *
 * Même patron que lib/admin/campaign-performance-actions.ts :
 * assertSupportStaff() → withTenantContext → lecture pure.
 * agencyId toujours résolu serveur.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { and, eq, sql } from "drizzle-orm"
import { leads, reservationFinancials } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Auth guard                                                                  */
/* -------------------------------------------------------------------------- */

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
  if (
    !(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? "")
  ) {
    throw new Error("FORBIDDEN")
  }
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ConversionFunnelRow {
  channel: string | null
  productType: string
  total: number
  newCount: number
  contactedCount: number
  convertedCount: number
  closedCount: number
  /** (convertedCount / total) * 100, arrondi 1 décimale */
  conversionRate: string
  /** Somme reservationFinancials.salePriceTnd pour les leads convertis */
  revenueTnd: string
  /** Somme reservationFinancials.marginAmount pour les leads convertis */
  marginTnd: string
}

export type GetConversionFunnelResult =
  | { ok: true; rows: ConversionFunnelRow[] }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getConversionFunnel(): Promise<GetConversionFunnelResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        // 1. Comptages par (channel, productType)
        const counts = await tx
          .select({
            channel: leads.channel,
            productType: leads.productType,
            total: sql<number>`count(*)::int`,
            newCount:
              sql<number>`count(*) filter (where ${leads.status} = 'new')::int`,
            contactedCount:
              sql<number>`count(*) filter (where ${leads.status} = 'contacted')::int`,
            convertedCount:
              sql<number>`count(*) filter (where ${leads.status} = 'converted')::int`,
            closedCount:
              sql<number>`count(*) filter (where ${leads.status} = 'closed')::int`,
          })
          .from(leads)
          .where(eq(leads.agencyId, ctx.agencyId))
          .groupBy(leads.channel, leads.productType)

        // 2. CA + marge des leads convertis (jointure leads → reservationFinancials)
        //    FINANCIAL est l'unique propriétaire de la vérité financière.
        const financials = await tx
          .select({
            channel: leads.channel,
            productType: leads.productType,
            revenueTnd:
              sql<string>`coalesce(sum(${reservationFinancials.salePriceTnd}::numeric), 0)::text`,
            marginTnd:
              sql<string>`coalesce(sum(${reservationFinancials.marginAmount}::numeric), 0)::text`,
          })
          .from(leads)
          .innerJoin(
            reservationFinancials,
            eq(reservationFinancials.reservationId, leads.reservationId),
          )
          .where(
            and(
              eq(leads.agencyId, ctx.agencyId),
              eq(leads.status, "converted"),
            ),
          )
          .groupBy(leads.channel, leads.productType)

        // Index financials par clé composite pour O(1) lookup
        const finMap = new Map(
          financials.map((f) => [
            `${f.channel ?? ""}::${f.productType}`,
            f,
          ]),
        )

        return counts.map((c): ConversionFunnelRow => {
          const fin = finMap.get(`${c.channel ?? ""}::${c.productType}`)
          const rate =
            c.total > 0
              ? ((c.convertedCount / c.total) * 100).toFixed(1)
              : "0.0"
          return {
            channel: c.channel,
            productType: c.productType,
            total: c.total,
            newCount: c.newCount,
            contactedCount: c.contactedCount,
            convertedCount: c.convertedCount,
            closedCount: c.closedCount,
            conversionRate: rate,
            revenueTnd: fin?.revenueTnd ?? "0.00",
            marginTnd: fin?.marginTnd ?? "0.00",
          }
        })
      },
    )
    return { ok: true, rows }
  } catch (err) {
    console.error("[getConversionFunnel]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
