/**
 * Helpers serveur partagés par les pages `/pro/*`.
 *
 * Évitent la duplication du combo `createServerSupabase` +
 * `getCurrentPartnerProfile` + `getMarginsForAgency` que toutes les
 * pages SERP/détail/booking ont besoin pour appliquer les marges.
 *
 * Ce fichier est isolé du runtime client (importe Drizzle + Supabase
 * server). Le pur calcul de marge reste dans `pricing.ts` afin que les
 * composants client puissent y accéder sans tirer pg/fs/net.
 */

import "server-only"

import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { marginRules, pricingMargins } from "@/lib/db/schema"
import { withCache } from "@/lib/cache/redis"
import { logger } from "@/lib/logger"
import {
  DEFAULT_MARGINS,
  type MarginMap,
  type MarginModule,
  type MarginRule,
} from "./pricing"

/** Durée du cache marges — 5 min. Suffisant pour les prix live, évite les N DB calls par session. */
const MARGINS_CACHE_TTL = 300

/** Clé de cache Redis pour les marges d'une agence. */
function marginsCacheKey(agencyId: string) {
  return `e2b:margins:${agencyId}`
}

/**
 * Invalide le cache des marges pour une agence (appeler après update des règles de marge).
 * À appeler depuis l'action admin qui modifie `pricing_margins`.
 */
export async function invalidateMarginsCache(agencyId: string): Promise<void> {
  const { getRedis } = await import("@/lib/cache/redis")
  const redis = getRedis()
  if (redis) await redis.del(marginsCacheKey(agencyId))
}

/**
 * Récupère la `MarginMap` complète pour une agence donnée. Toujours
 * fusionnée avec les valeurs par défaut afin que chaque module ait une
 * règle, même si la BDD n'a pas (encore) la ligne.
 */
const MARGIN_MODULES = new Set<string>(["hotel", "flight", "transfer"])

export async function getMarginsForAgency(
  agencyId: string | null | undefined,
  userId = "",
): Promise<MarginMap> {
  if (!agencyId || !process.env.DATABASE_URL) return { ...DEFAULT_MARGINS }

  try {
    return await withCache(marginsCacheKey(agencyId), MARGINS_CACHE_TTL, async () => {
      // System A — pricing_margins (primary, UI-managed per module)
      const pmRows = await withTenantContext(
        { agencyId, userId, isSuperAdmin: false },
        (db) =>
          db
            .select({
              module: pricingMargins.module,
              marginType: pricingMargins.marginType,
              marginValue: pricingMargins.marginValue,
              isActive: pricingMargins.isActive,
            })
            .from(pricingMargins)
            .where(and(eq(pricingMargins.agencyId, agencyId), eq(pricingMargins.isActive, true))),
      )

      // System B — margin_rules, module-level only (supplierId/destination/price context is NULL).
      // These are the only rules that are meaningful without a live booking context and therefore
      // the only ones we can safely fold into the agency MarginMap used for SERP pricing.
      // Ordered descending by priority so the first match per productType wins.
      const nowIso = new Date().toISOString()
      const mrRows = await withTenantContext(
        { agencyId, userId, isSuperAdmin: false },
        (db) =>
          db
            .select({
              productType: marginRules.productType,
              type: marginRules.type,
              percentValue: marginRules.percentValue,
              fixedValue: marginRules.fixedValue,
            })
            .from(marginRules)
            .where(
              and(
                eq(marginRules.agencyId, agencyId),
                eq(marginRules.isActive, true),
                isNull(marginRules.supplierId),
                isNull(marginRules.destination),
                isNull(marginRules.minPrice),
                isNull(marginRules.maxPrice),
                or(isNull(marginRules.validFrom), lte(marginRules.validFrom, nowIso)),
                or(isNull(marginRules.validTo), gte(marginRules.validTo, nowIso)),
              ),
            )
            .orderBy(desc(marginRules.priority)),
      )

      // Build map from System A (baseline)
      const map: MarginMap = { ...DEFAULT_MARGINS }
      for (const row of pmRows) {
        map[row.module as MarginModule] = {
          marginType: row.marginType as MarginRule["marginType"],
          marginValue: Number.parseFloat(row.marginValue ?? "0"),
          isActive: row.isActive,
        }
      }

      // Override with System B where a module-level rule is configured.
      // highest-priority rule per productType wins (rows already sorted desc).
      // For hybrid rules the percent side is used — fixed component requires a
      // live price and cannot be previewed without a booking context.
      const seenModules = new Set<string>()
      for (const row of mrRows) {
        const mod = row.productType
        if (!mod || !MARGIN_MODULES.has(mod) || seenModules.has(mod)) continue
        seenModules.add(mod)
        const isFixed = row.type === "fixed"
        map[mod as MarginModule] = {
          marginType: isFixed ? "fixed" : "percent",
          marginValue: Number.parseFloat((isFixed ? row.fixedValue : row.percentValue) ?? "0"),
          isActive: true,
        }
      }

      return map
    })
  } catch (err) {
    logger.error("[server-context] getMarginsForAgency failed", {
      agencyId,
      code: err instanceof Error ? err.constructor.name : "unknown",
    })
    return { ...DEFAULT_MARGINS }
  }
}

/**
 * Retourne la `MarginMap` à appliquer aux prix affichés pour la session
 * courante. Si l'utilisateur n'est pas authentifié (preview public) ou
 * si la BDD n'est pas disponible, retourne les marges par défaut afin
 * que les pages restent affichables en démo.
 */
export async function getActivePartnerMargins(): Promise<MarginMap> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ...DEFAULT_MARGINS }
    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) return { ...DEFAULT_MARGINS }
    return await getMarginsForAgency(profile.agency.id, user.id)
  } catch (err) {
    logger.error("[server-context] getActivePartnerMargins failed", { code: err instanceof Error ? err.constructor.name : "unknown" })
    return { ...DEFAULT_MARGINS }
  }
}
