"use server"

/**
 * Server Actions pour Yield Engine (admin only).
 * Fichier séparé pour éviter les imports serveur dans les Client Components.
 */

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getDb } from "@/lib/db/client"
import { yieldRules, users, type NewYieldRule } from "@/lib/db/schema"
import { memoize, invalidate } from "@/lib/cache/redis"
import { createServerSupabase } from "@/lib/supabase/server"
import {
  type YieldModule,
  type YieldRuleType,
  type YieldRule,
  type YieldRuleMap,
  ALL_YIELD_MODULES,
  defaultRule,
} from "./math"

/** Vérifie que l'appelant est super_admin. Retourne l'erreur ou null. */
async function assertAdminForYield(): Promise<{ ok: false; error: string } | null> {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }

    const db = getDb()
    const [actor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    if (!actor || actor.role !== "super_admin") {
      return { ok: false, error: "Accès refusé : rôle super_admin requis" }
    }
    return null
  } catch {
    return { ok: false, error: "Erreur de vérification des droits" }
  }
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
  const authErr = await assertAdminForYield()
  if (authErr) return authErr

  const parsed = UpsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalide" }
  }

  const db = getDb()
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

  const [row] = await db
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
    .returning({ id: yieldRules.id })

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
  const authErr = await assertAdminForYield()
  if (authErr) return authErr

  const db = getDb()
  await db
    .update(yieldRules)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(yieldRules.id, ruleId))

  await invalidate(`e2b:yield:${agencyId}`)
  revalidatePath("/admin/marges")

  return { ok: true, data: undefined }
}
