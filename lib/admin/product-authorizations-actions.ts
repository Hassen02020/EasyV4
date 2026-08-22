"use server"

/**
 * Autorisation/révocation de revente B2B / White Label (Phase 13.1, gap #2).
 *
 * Gardé par `assertProductManager()` (même garde que le reste du Master
 * Admin Product Builder Phase 13 — role manager/super_admin + agence OTA).
 * Écrit dans `product_authorizations` (0023_commerce_completion.sql), qui
 * élargit la RLS lecture des 3 tables catalogue pour l'agence autorisée —
 * voir le commentaire de tête de cette migration pour le constat complet.
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { productAuthorizations, agencies } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import type { ProductActionResult } from "./packages-actions"

type AuthorizedProductType = "package" | "omra" | "activity"

export interface PartnerAgencyOption {
  id: string
  name: string
  brandName: string | null
  agencyType: string
}

/** Agences pouvant recevoir une autorisation de revente : partenaires B2B ET agences OTA (tenants White Label potentiels). */
export async function listAuthorizableAgencies(): Promise<ProductActionResult<PartnerAgencyOption[]>> {
  try {
    const ctx = await assertProductManager()
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      tx
        .select({ id: agencies.id, name: agencies.name, brandName: agencies.brandName, agencyType: agencies.agencyType })
        .from(agencies)
        .where(eq(agencies.status, "active")),
    )
    return { ok: true, data: rows.filter((a) => a.id !== ctx.agencyId) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

export async function authorizeAgencyForProduct(input: {
  agencyId: string
  productType: AuthorizedProductType
  productId: string
  channel: "b2b" | "white_label"
}): Promise<ProductActionResult<{ id: string }>> {
  try {
    const ctx = await assertProductManager()
    const [row] = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      tx
        .insert(productAuthorizations)
        .values({
          agencyId: input.agencyId,
          productType: input.productType,
          productId: input.productId,
          channel: input.channel,
          isActive: true,
          createdByUserId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [productAuthorizations.agencyId, productAuthorizations.productType, productAuthorizations.productId],
          set: { isActive: true, channel: input.channel, updatedAt: new Date() },
        })
        .returning({ id: productAuthorizations.id }),
    )
    revalidatePath("/admin/products")
    return { ok: true, data: row }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

export async function revokeAgencyAuthorization(authorizationId: string): Promise<ProductActionResult<null>> {
  try {
    const ctx = await assertProductManager()
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      tx
        .update(productAuthorizations)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(productAuthorizations.id, authorizationId))),
    )
    revalidatePath("/admin/products")
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

export async function listAuthorizationsForProduct(
  productType: AuthorizedProductType,
  productId: string,
): Promise<ProductActionResult<Array<{ id: string; agencyId: string; agencyName: string; channel: string; isActive: boolean }>>> {
  try {
    const ctx = await assertProductManager()
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      tx
        .select({
          id: productAuthorizations.id,
          agencyId: productAuthorizations.agencyId,
          agencyName: agencies.name,
          channel: productAuthorizations.channel,
          isActive: productAuthorizations.isActive,
        })
        .from(productAuthorizations)
        .innerJoin(agencies, eq(agencies.id, productAuthorizations.agencyId))
        .where(and(eq(productAuthorizations.productType, productType), eq(productAuthorizations.productId, productId))),
    )
    return { ok: true, data: rows }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

