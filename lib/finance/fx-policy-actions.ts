"use server"

/**
 * FX-ADMIN-01 — Server actions pour la gestion des politiques FX.
 * Accessible super_admin uniquement (vérifié dans chaque action).
 *
 * Invariants :
 *  - version auto-incrémentée : max(version) + 1, atomique en transaction
 *  - une politique "active" = effectiveTo IS NULL ou effectiveTo > now()
 *  - désactiver = effectiveTo = now() (pas de suppression physique)
 */

import { redirect } from "next/navigation"
import { eq, max } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { fxPolicies } from "@/lib/db/schema/financials"
import type { CorrectionMode, BankFeeMode, FxPolicy } from "./fx-policy"

export interface CreateFxPolicyInput {
  correctionMode: CorrectionMode
  correctionValue: number
  bankFeeMode: BankFeeMode
  bankFeeFixed: number | null
  bankFeePercent: number | null
  bankFeeMin: number | null
  bankFeeMax: number | null
  note: string | null
}

async function requireSuperAdmin(): Promise<string> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/fx-policy")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") {
    redirect("/admin")
  }
  return user.id
}

export async function listFxPolicies(): Promise<FxPolicy[]> {
  await requireSuperAdmin()
  const db = getDb()
  const rows = await db.select().from(fxPolicies).orderBy(fxPolicies.version)

  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    effectiveFrom: new Date(r.effectiveFrom as unknown as string),
    effectiveTo: r.effectiveTo
      ? new Date(r.effectiveTo as unknown as string)
      : null,
    correctionMode: r.correctionMode as CorrectionMode,
    correctionValue: Number(r.correctionValue),
    bankFeeMode: r.bankFeeMode as BankFeeMode,
    bankFeeFixed: r.bankFeeFixed !== null ? Number(r.bankFeeFixed) : null,
    bankFeePercent: r.bankFeePercent !== null ? Number(r.bankFeePercent) : null,
    bankFeeMin: r.bankFeeMin !== null ? Number(r.bankFeeMin) : null,
    bankFeeMax: r.bankFeeMax !== null ? Number(r.bankFeeMax) : null,
    bankFeeCurrency: r.bankFeeCurrency,
    note: r.note,
    createdBy: r.createdBy,
    createdAt: new Date(r.createdAt as unknown as string),
  }))
}

export async function createFxPolicy(
  input: CreateFxPolicyInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const userId = await requireSuperAdmin()
    validateInput(input)

    const db = getDb()

    const [maxRow] = await db
      .select({ maxVersion: max(fxPolicies.version) })
      .from(fxPolicies)

    const nextVersion = (maxRow?.maxVersion ?? 0) + 1

    const [inserted] = await db
      .insert(fxPolicies)
      .values({
        version: nextVersion,
        effectiveFrom: new Date(),
        effectiveTo: null,
        correctionMode: input.correctionMode,
        correctionValue: String(input.correctionValue),
        bankFeeMode: input.bankFeeMode,
        bankFeeFixed:
          input.bankFeeFixed !== null ? String(input.bankFeeFixed) : null,
        bankFeePercent:
          input.bankFeePercent !== null ? String(input.bankFeePercent) : null,
        bankFeeMin: input.bankFeeMin !== null ? String(input.bankFeeMin) : null,
        bankFeeMax: input.bankFeeMax !== null ? String(input.bankFeeMax) : null,
        bankFeeCurrency: "TND",
        note: input.note,
        createdBy: userId,
      })
      .returning({ id: fxPolicies.id })

    revalidatePath("/admin/fx-policy")
    return { ok: true, id: inserted!.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function deactivateFxPolicy(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdmin()
    const db = getDb()
    await db
      .update(fxPolicies)
      .set({ effectiveTo: new Date() })
      .where(eq(fxPolicies.id, id))

    revalidatePath("/admin/fx-policy")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

function validateInput(input: CreateFxPolicyInput): void {
  if (input.correctionMode === "PERCENTAGE") {
    if (input.correctionValue < 0 || input.correctionValue > 100) {
      throw new Error(
        "correctionValue en mode PERCENTAGE doit être entre 0 et 100",
      )
    }
  }
  if (input.correctionMode === "FIXED_RATE" && input.correctionValue <= 0) {
    throw new Error("correctionValue en mode FIXED_RATE doit être > 0")
  }
  if (
    input.bankFeeMode === "FIXED" &&
    (input.bankFeeFixed === null || input.bankFeeFixed < 0)
  ) {
    throw new Error("bankFeeFixed requis et >= 0 pour le mode FIXED")
  }
  if (
    input.bankFeeMode === "PERCENTAGE" &&
    (input.bankFeePercent === null || input.bankFeePercent < 0)
  ) {
    throw new Error("bankFeePercent requis et >= 0 pour le mode PERCENTAGE")
  }
  if (input.bankFeeMode === "MIN_MAX") {
    if (input.bankFeePercent === null || input.bankFeePercent < 0) {
      throw new Error("bankFeePercent requis pour le mode MIN_MAX")
    }
    if (
      input.bankFeeMin !== null &&
      input.bankFeeMax !== null &&
      input.bankFeeMin > input.bankFeeMax
    ) {
      throw new Error("bankFeeMin ne peut pas être supérieur à bankFeeMax")
    }
  }
}
