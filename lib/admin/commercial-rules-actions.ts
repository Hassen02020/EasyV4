"use server"

/**
 * COMMERCIAL-RULES-ADMIN-01 — Server actions pour gérer hotel_commercial_rules
 * et flight_commercial_rules via /admin/commercial-rules.
 *
 * Réservé super_admin — même guard que commercial-agreements-actions.ts.
 * Défense en profondeur : vérification applicative + RLS DB (is_super_admin()).
 *
 * Invariant CURRENCY-DIM-01 : currency doit être "TND" pour les règles hôtels
 * (le moteur lève une erreur si supplierCurrency !== rules.currency).
 * Pour les vols, la devise peut être "EUR" ou "USD" selon le fournisseur.
 */

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { hotelCommercialRules, flightCommercialRules } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    return {
      ok: false as const,
      error: "Seul un super_admin peut gérer les règles commerciales.",
    }
  }
  return { ok: true as const, user, profile }
}

const REVALIDATE_PATH = "/admin/commercial-rules"

// ---------------------------------------------------------------------------
// Types communs
// ---------------------------------------------------------------------------

export interface CommercialRuleRow {
  id: string
  type: "hotel" | "flight"
  agencyId: string | null
  channel: string | null
  priority: number
  productScope: Record<string, unknown> | null
  fixedFee: string
  markupRate: string
  minMarkup: string | null
  maxMarkup: string | null
  currency: string
  isActive: boolean
  validFrom: Date | null
  validTo: Date | null
  notes: string | null
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listCommercialRules(
  type?: "hotel" | "flight",
): Promise<CommercialRuleRow[]> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return []
  const { user } = auth

  return withTenantContext(
    { agencyId: null, userId: user.id, isSuperAdmin: true },
    async (tx) => {
      const hotelRows: CommercialRuleRow[] =
        type === "flight"
          ? []
          : (
              await tx
                .select()
                .from(hotelCommercialRules)
                .orderBy(desc(hotelCommercialRules.priority))
            ).map((r) => ({
              id: r.id,
              type: "hotel" as const,
              agencyId: r.agencyId,
              channel: r.channel,
              priority: r.priority,
              productScope: r.productScope as Record<string, unknown> | null,
              fixedFee: r.fixedFee,
              markupRate: r.markupRate,
              minMarkup: r.minMarkup,
              maxMarkup: r.maxMarkup,
              currency: r.currency,
              isActive: r.isActive,
              validFrom: r.validFrom,
              validTo: r.validTo,
              notes: r.notes,
              createdAt: r.createdAt,
            }))

      const flightRows: CommercialRuleRow[] =
        type === "hotel"
          ? []
          : (
              await tx
                .select()
                .from(flightCommercialRules)
                .orderBy(desc(flightCommercialRules.priority))
            ).map((r) => ({
              id: r.id,
              type: "flight" as const,
              agencyId: r.agencyId,
              channel: r.channel,
              priority: r.priority,
              productScope: r.productScope as Record<string, unknown> | null,
              fixedFee: r.fixedFee,
              markupRate: r.markupRate,
              minMarkup: r.minMarkup,
              maxMarkup: r.maxMarkup,
              currency: r.currency,
              isActive: r.isActive,
              validFrom: r.validFrom,
              validTo: r.validTo,
              notes: r.notes,
              createdAt: r.createdAt,
            }))

      return [...hotelRows, ...flightRows]
    },
  )
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  type: z.enum(["hotel", "flight"]),
  agencyId: z.string().uuid().nullable().default(null),
  channel: z
    .enum(["B2C", "B2B", "PARTNER", "WHITE_LABEL"])
    .nullable()
    .default(null),
  priority: z.coerce.number().int().min(1).max(1000).default(50),
  // productScope is free-form JSON (validated semantically by caller)
  productScope: z.record(z.unknown()).nullable().default(null),
  fixedFee: z.coerce.number().min(0).default(0),
  markupRate: z.coerce.number().min(0).max(1).default(0),
  minMarkup: z.coerce.number().min(0).nullable().default(null),
  maxMarkup: z.coerce.number().min(0).nullable().default(null),
  // CURRENCY-DIM-01 : hôtels = TND uniquement (moteur lève si mismatch)
  currency: z.string().trim().length(3).toUpperCase().default("TND"),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  notes: z.string().max(2000).nullable().default(null),
})

export type CreateCommercialRuleInput = z.input<typeof createRuleSchema>

export type CreateCommercialRuleResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string }

export async function createCommercialRule(
  raw: CreateCommercialRuleInput,
): Promise<CreateCommercialRuleResult> {
  const parsed = createRuleSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  // CURRENCY-DIM-01 : forcer TND pour les règles hôtels
  if (input.type === "hotel" && input.currency !== "TND") {
    return {
      ok: false,
      error:
        "Les règles hôtels doivent utiliser TND (CURRENCY-DIM-01 — le moteur ne convertit pas les devises).",
    }
  }

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    const ruleId = await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        const values = {
          agencyId: input.agencyId,
          channel: input.channel,
          priority: input.priority,
          productScope: input.productScope,
          fixedFee: String(input.fixedFee),
          markupRate: String(input.markupRate),
          minMarkup: input.minMarkup !== null ? String(input.minMarkup) : null,
          maxMarkup: input.maxMarkup !== null ? String(input.maxMarkup) : null,
          currency: input.currency,
          isActive: true,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validTo: input.validTo ? new Date(input.validTo) : null,
          notes: input.notes,
        }

        if (input.type === "hotel") {
          const [row] = await tx
            .insert(hotelCommercialRules)
            .values(values)
            .returning({ id: hotelCommercialRules.id })
          return row!.id
        } else {
          const [row] = await tx
            .insert(flightCommercialRules)
            .values(values)
            .returning({ id: flightCommercialRules.id })
          return row!.id
        }
      },
    )

    revalidatePath(REVALIDATE_PATH)
    return { ok: true, ruleId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    }
  }
}

// ---------------------------------------------------------------------------
// Toggle actif / inactif
// ---------------------------------------------------------------------------

export type ToggleCommercialRuleResult =
  | { ok: true }
  | { ok: false; error: string }

export async function toggleCommercialRule(
  type: "hotel" | "flight",
  id: string,
  isActive: boolean,
): Promise<ToggleCommercialRuleResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        if (type === "hotel") {
          const [updated] = await tx
            .update(hotelCommercialRules)
            .set({ isActive, updatedAt: new Date() })
            .where(eq(hotelCommercialRules.id, id))
            .returning({ id: hotelCommercialRules.id })
          if (!updated) throw new Error("Règle hôtel introuvable")
        } else {
          const [updated] = await tx
            .update(flightCommercialRules)
            .set({ isActive, updatedAt: new Date() })
            .where(eq(flightCommercialRules.id, id))
            .returning({ id: flightCommercialRules.id })
          if (!updated) throw new Error("Règle vol introuvable")
        }
      },
    )

    revalidatePath(REVALIDATE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    }
  }
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

export type DeleteCommercialRuleResult =
  | { ok: true }
  | { ok: false; error: string }

export async function deleteCommercialRule(
  type: "hotel" | "flight",
  id: string,
): Promise<DeleteCommercialRuleResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        if (type === "hotel") {
          await tx
            .delete(hotelCommercialRules)
            .where(
              and(
                eq(hotelCommercialRules.id, id),
                eq(hotelCommercialRules.isActive, false),
              ),
            )
        } else {
          await tx
            .delete(flightCommercialRules)
            .where(
              and(
                eq(flightCommercialRules.id, id),
                eq(flightCommercialRules.isActive, false),
              ),
            )
        }
      },
    )

    revalidatePath(REVALIDATE_PATH)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    }
  }
}
