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

import { and, eq } from "drizzle-orm"

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { getDb } from "@/lib/db/client"
import { pricingMargins } from "@/lib/db/schema"
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
export async function getMarginsForAgency(
  agencyId: string | null | undefined,
): Promise<MarginMap> {
  if (!agencyId || !process.env.DATABASE_URL) return { ...DEFAULT_MARGINS }

  try {
    return await withCache(marginsCacheKey(agencyId), MARGINS_CACHE_TTL, async () => {
      const db = getDb()
      const rows = await db
        .select({
          module: pricingMargins.module,
          marginType: pricingMargins.marginType,
          marginValue: pricingMargins.marginValue,
          isActive: pricingMargins.isActive,
        })
        .from(pricingMargins)
        .where(
          and(
            eq(pricingMargins.agencyId, agencyId),
            eq(pricingMargins.isActive, true),
          ),
        )

      const map: MarginMap = { ...DEFAULT_MARGINS }
      for (const row of rows) {
        const mod = row.module as MarginModule
        map[mod] = {
          marginType: row.marginType as MarginRule["marginType"],
          marginValue: Number.parseFloat(row.marginValue ?? "0"),
          isActive: row.isActive,
        }
      }
      return map
    })
  } catch (err) {
    logger.error("[server-context] getMarginsForAgency failed", { agencyId, code: err instanceof Error ? err.constructor.name : "unknown" })
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
    return await getMarginsForAgency(profile.agency.id)
  } catch (err) {
    logger.error("[server-context] getActivePartnerMargins failed", { code: err instanceof Error ? err.constructor.name : "unknown" })
    return { ...DEFAULT_MARGINS }
  }
}
