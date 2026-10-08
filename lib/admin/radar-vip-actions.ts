"use server"

/**
 * RADAR-VIP-01/02 — "Qui devient important ?"
 *
 * RADAR-VIP-01 : vue population — top 50 leads classés par score VIP décroissant.
 * RADAR-VIP-02 : déduplication contactuelle — un acteur avec N leads (hôtel,
 *   Omra, vol, visa) apparaît en 1 ligne "ACTEUR MULTI-PRODUIT", pas N.
 *
 * Stratégie de déduplication (meilleure approximation sans requête
 * supplémentaire, conforme au refus de fusion silencieuse documenté dans
 * contact-core.ts) :
 *
 *   clé = email normalisé (lowercase+trim) si présent,
 *         sinon phone normalisé (chiffres uniquement) si présent,
 *         sinon leadId (lead isolé, non rattachable)
 *
 * Limitation explicite : deux leads partageant le même téléphone mais des
 * emails différents ne seront pas fusionnés. C'est une déduplication
 * best-effort email-first, pas un résolveur de contacts complet.
 * Pour une fusion exacte, utiliser les contacts CONTACT-01 persistés —
 * chantier RADAR-VIP-03 potentiel (findExistingContactIdForLeadCore).
 *
 * Sélection du représentant : dans un groupe de N leads, le lead au score
 * le plus élevé devient le représentant. Son score reflète déjà l'ensemble
 * des réservations du contact (via findMatchingCustomerIdsCore dans
 * getVipScoreForLeadCore) — pas de nouveau calcul agrégé nécessaire.
 *
 * Portée délibérément limitée : on score les 200 leads les plus récents,
 * on déduplication, on retourne les 50 meilleurs acteurs. Performance
 * acceptable sans cache ni table matérialisée.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { listLeadsCore } from "@/lib/crm/leads-core"
import {
  getVipScoreForLeadCore,
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
  /** RADAR-VIP-02 — nombre de leads fusionnés dans ce groupe (>1 = acteur multi-produit). */
  leadCount: number
  /** RADAR-VIP-02 — produits distincts de tous les leads du groupe, triés. */
  products: string[]
}

export type GetRadarVipResult =
  | { ok: true; rows: VipRadarRow[]; total: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Clé de regroupement best-effort : email normalisé > phone normalisé > leadId.
 * Pas un résolveur de contacts complet — see en-tête.
 */
function contactKey(
  email: string | null | undefined,
  phone: string | null | undefined,
  leadId: string,
): string {
  if (email) return `email:${email.trim().toLowerCase()}`
  if (phone) return `phone:${phone.replace(/\D/g, "")}`
  return `lead:${leadId}`
}

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

        // 3. Scorer chaque lead (séquentiel pour éviter N requêtes simultanées)
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
          })
        }

        // 4. RADAR-VIP-02 — déduplication contactuelle
        //    Grouper par clé contact, garder le représentant au score max,
        //    agréger products[] et leadCount.
        const groups = new Map<string, VipRadarRow>()
        for (const row of scored) {
          const key = contactKey(row.email, row.phone, row.leadId)
          const existing = groups.get(key)
          if (!existing) {
            groups.set(key, { ...row, products: [row.productType], leadCount: 1 })
          } else {
            // Accumuler les produits distincts
            if (!existing.products.includes(row.productType)) {
              existing.products.push(row.productType)
            }
            existing.leadCount += 1
            // Le représentant est celui au score le plus élevé
            if (row.score.total > existing.score.total) {
              groups.set(key, {
                ...row,
                products: existing.products,
                leadCount: existing.leadCount,
              })
            }
          }
        }

        // 5. Trier les acteurs dédupliqués par score décroissant, garder top 50
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
