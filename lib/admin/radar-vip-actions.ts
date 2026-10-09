"use server"

/**
 * RADAR-VIP-01/02/03 — "Qui devient important ?"
 *
 * RADAR-VIP-01 : vue population — top 50 leads scorés.
 * RADAR-VIP-02 : déduplication best-effort email-first (contactKey).
 * RADAR-VIP-03 : déduplication EXACTE via CONTACT-01 persisté —
 *   `findExistingContactIdForLeadCore` résout chaque lead vers son
 *   contactId réel (même logique que getVipScoreForLeadCore en interne).
 *   Leads sans contact persisté (flux non encore résolu, ou lead sans
 *   email/téléphone) gardent leur leadId comme clé de groupe — jamais
 *   regroupés par erreur avec d'autres.
 *
 * Stratégie :
 *   1. Charger règles + 200 leads récents
 *   2. Scorer chaque lead (séquentiel, voir RADAR-VIP-01)
 *   3. Résoudre le contactId de chaque lead (séquentiel, lecture seule)
 *   4. Grouper par contactId (ou leadId si non résolu)
 *   5. Représentant = lead au score le plus élevé du groupe
 *      (son score reflète déjà toutes les réservations du contact
 *      via findMatchingCustomerIdsCore — pas de recalcul)
 *   6. Trier par score.total desc, top 50
 *
 * Aucune écriture, aucune création de contact, aucune persistance.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { listLeadsCore } from "@/lib/crm/leads-core"
import {
  getVipScoreForLeadCore,
  findExistingContactIdForLeadCore,
  DEFAULT_VIP_SCORE_WEIGHTS,
  type VipScore,
} from "@/lib/crm/vip-score-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"

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

export interface VipRadarRow {
  /** Lead représentant du groupe (score le plus élevé du groupe). */
  leadId: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  /** Produit du lead représentant. Voir aussi `products` pour la liste complète. */
  productType: string
  channel: string | null
  destination: string | null
  status: string
  score: VipScore
  /** RADAR-VIP-02/03 — nombre de leads fusionnés dans ce groupe (>1 = acteur multi-produit). */
  leadCount: number
  /** RADAR-VIP-02/03 — produits distincts de tous les leads du groupe, triés. */
  products: string[]
  /** RADAR-VIP-03 — contactId CONTACT-01 résolu ; null si lead non encore rattaché à un contact. */
  contactId: string | null
}

export type GetRadarVipResult =
  | { ok: true; rows: VipRadarRow[]; total: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getRadarVip(): Promise<GetRadarVipResult> {
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
        // 1. Charger les règles de scoring de qualité
        const scoreRules = await getLeadScoreRuleMapCore(tx, {
          agencyId: ctx.agencyId,
        })

        // 2. Lister les leads récents (listLeadsCore plafonne à 200)
        const leads = await listLeadsCore(tx, { agencyId: ctx.agencyId })

        // 3. Scorer chaque lead (séquentiel)
        const scored: VipRadarRow[] = []
        for (const lead of leads) {
          const result = await getVipScoreForLeadCore(tx, {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            scoreRules,
            weights: DEFAULT_VIP_SCORE_WEIGHTS,
          })
          if (!result) continue
          scored.push({
            leadId: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            productType: lead.productType,
            channel: lead.channel ?? null,
            destination: lead.destination ?? null,
            status: lead.status,
            score: result.score,
            leadCount: 1,
            products: [lead.productType],
            contactId: null,
          })
        }

        // 4. RADAR-VIP-03 — résolution exacte contactId CONTACT-01 (lecture seule)
        for (const row of scored) {
          row.contactId = await findExistingContactIdForLeadCore(tx, {
            agencyId: ctx.agencyId,
            email: row.email,
            phone: row.phone,
          })
        }

        // 5. Déduplication exacte par contactId (ou leadId si non résolu)
        const groups = new Map<string, VipRadarRow>()
        for (const row of scored) {
          const key = row.contactId ?? `lead:${row.leadId}`
          const existing = groups.get(key)
          if (!existing) {
            groups.set(key, {
              ...row,
              products: [row.productType],
              leadCount: 1,
            })
          } else {
            if (!existing.products.includes(row.productType)) {
              existing.products.push(row.productType)
            }
            existing.leadCount += 1
            if (row.score.total > existing.score.total) {
              groups.set(key, {
                ...row,
                products: existing.products,
                leadCount: existing.leadCount,
              })
            }
          }
        }

        // 6. Trier par score décroissant, top 50
        const deduped = Array.from(groups.values())
        deduped.sort((a, b) => b.score.total - a.score.total)
        for (const row of deduped) {
          row.products = row.products.slice().sort()
        }
        return deduped.slice(0, 50)
      },
    )
    return { ok: true, rows, total: rows.length }
  } catch (err) {
    console.error("[getRadarVip]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
