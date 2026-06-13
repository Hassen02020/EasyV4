/**
 * Yield Engine — Easy2Book
 *
 * Charge les règles de marge depuis la DB (cache Redis 5min).
 *
 * Les fonctions de CALCUL PUR (applyYield, yieldDelta, applyYieldToOffers)
 * sont dans `lib/yield/math.ts` pour être importables côté client aussi.
 *
 * Les Server Actions admin (upsert, toggle) sont dans `lib/yield/actions.ts`.
 */

import { eq, and } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { yieldRules } from "@/lib/db/schema"
import { memoize, invalidate } from "@/lib/cache/redis"
import {
  type YieldModule,
  type YieldRuleType,
  type YieldRule,
  type YieldRuleMap,
  ALL_YIELD_MODULES,
  defaultRule,
} from "./math"

export type { YieldModule, YieldRuleType, YieldRule, YieldRuleMap }
export { applyYield, yieldDelta, applyYieldToOffers } from "./math"

// ---------------------------------------------------------------------------
// Chargement des règles (DB + cache)
// ---------------------------------------------------------------------------

/**
 * Charge toutes les règles actives d'une agence.
 * Retourne une map complète : modules sans règle DB → règle par défaut.
 * Peut être appelé depuis Server Components et API Routes (pas de "use server").
 */
export async function getYieldRules(agencyId: string): Promise<YieldRuleMap> {
  const cacheKey = `e2b:yield:${agencyId}`

  return memoize(cacheKey, 300, async () => {
    const db = getDb()
    const rows = await db
      .select()
      .from(yieldRules)
      .where(
        and(eq(yieldRules.agencyId, agencyId), eq(yieldRules.isActive, true)),
      )

    const map = Object.fromEntries(
      ALL_YIELD_MODULES.map((m) => [m, defaultRule(agencyId, m)]),
    ) as YieldRuleMap

    for (const row of rows) {
      const m = row.module as YieldModule
      map[m] = {
        id: row.id,
        agencyId: row.agencyId,
        module: m,
        ruleType: row.ruleType as YieldRuleType,
        percentValue: parseFloat(row.percentValue),
        fixedValueTnd: parseFloat(row.fixedValueTnd),
        minPriceTnd: parseFloat(row.minPriceTnd),
        isActive: row.isActive,
      }
    }

    return map
  })
}
