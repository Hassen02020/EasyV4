"use server"

/**
 * Server Actions pour Yield Engine (admin only).
 * Fichier séparé pour éviter les imports serveur dans les Client Components.
 */

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { yieldRules, type NewYieldRule } from "@/lib/db/schema"
import { memoize, invalidate } from "@/lib/cache/redis"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  type YieldModule,
  type YieldRuleType,
  type YieldRule,
  type YieldRuleMap,
  ALL_YIELD_MODULES,
  defaultRule,
} from "./math"

/**
 * Vérifie que l'appelant est super_admin, via `resolve_session_context()`
 * (SECURITY DEFINER) — jamais un SELECT `users` direct avant que le contexte
 * RLS ne soit posé. Retourne le contexte tenant si OK, sinon l'erreur.
 */
async function assertAdminForYield(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié" }
  if (!session.isSuperAdmin) {
    return { ok: false, error: "Accès refusé : rôle super_admin requis" }
  }
  return { ok: true, userId: session.userId }
}

const UpsertSchema = z.object({
  agencyId: z.string().uuid(),
  module: z.enum([
    "hotel",
    "flight",
    "omra",
    "package",
    "activity",
    "transfer",
    "car",
  ]),
  ruleType: z.enum(["percent", "fixed", "combined"]),
  percentValue: z.coerce.number().min(0).max(200),
  fixedValueTnd: z.coerce.number().min(0),
  minPriceTnd: z.coerce.number().min(0),
  isActive: z.boolean().default(true),
})

export type UpsertYieldRuleInput = z.infer<typeof UpsertSchema>
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/**
 * Crée ou met à jour la règle de marge pour un module/agence.
 */
export async function upsertYieldRule(
  input: UpsertYieldRuleInput,
): Promise<ActionResult<{ id: string }>> {
  const authResult = await assertAdminForYield()
  if (!authResult.ok) return authResult

  const parsed = UpsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
  }

  const v = parsed.data

  const values: NewYieldRule = {
    agencyId: v.agencyId,
    module: v.module,
    ruleType: v.ruleType,
    percentValue: v.percentValue.toFixed(4),
    fixedValueTnd: v.fixedValueTnd.toFixed(3),
    minPriceTnd: v.minPriceTnd.toFixed(3),
    isActive: v.isActive,
  }

  // Vue cross-agence (super_admin configure la marge d'une agence
  // partenaire arbitraire) : is_super_admin=true requis.
  const [row] = await withTenantContext(
    { agencyId: null, userId: authResult.userId, isSuperAdmin: true },
    (db) =>
      db
        .insert(yieldRules)
        .values(values)
        .onConflictDoUpdate({
          target: [yieldRules.agencyId, yieldRules.module],
          set: {
            ruleType: values.ruleType,
            percentValue: values.percentValue,
            fixedValueTnd: values.fixedValueTnd,
            minPriceTnd: values.minPriceTnd,
            isActive: values.isActive,
            updatedAt: new Date(),
          },
        })
        .returning({ id: yieldRules.id }),
  )

  if (!row) return { ok: false, error: "Erreur DB lors de l'upsert" }

  await invalidate(`e2b:yield:${v.agencyId}`)
  revalidatePath("/admin/marges")
  revalidatePath(`/pro`)

  return { ok: true, data: { id: row.id } }
}

/**
 * Active ou désactive une règle sans la supprimer.
 */
export async function toggleYieldRule(
  ruleId: string,
  agencyId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const authResult = await assertAdminForYield()
  if (!authResult.ok) return authResult

  await withTenantContext(
    { agencyId: null, userId: authResult.userId, isSuperAdmin: true },
    (db) =>
      db
        .update(yieldRules)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(yieldRules.id, ruleId)),
  )

  await invalidate(`e2b:yield:${agencyId}`)
  revalidatePath("/admin/marges")

  return { ok: true, data: undefined }
}
