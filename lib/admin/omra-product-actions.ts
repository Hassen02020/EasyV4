"use server"

/**
 * Master Admin Product Builder — Omraty (Phase 13).
 *
 * Même rationale que `packages-actions.ts` : `omra_packages`/`omra_allotments`
 * n'avaient aucun chemin d'écriture nulle part dans le dépôt avant ce
 * fichier (confirmé par recherche avant Phase 13 — zéro
 * `insert(omraPackages)`/`update(omraPackages)` hors un script de stress
 * test). Les moteurs de réservation B2B (`createOmraBooking`) et B2C
 * (`createGuestOmraBooking`, Phase 12) existent déjà et fonctionnent — ils
 * n'avaient simplement rien à vendre, `omra_packages` étant vide en
 * production (confirmé avant migration 0022).
 *
 * Champs riches (vol, Makkah/Médine, transferts, accompagnateur) : stockés
 * dans `omra_packages.metadata` (jsonb) — voir
 * `lib/admin/schemas/omra-product.ts` pour le rationale complet (pas de
 * nouvelles colonnes, le champ existant est déjà documenté pour cet usage).
 */

import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import { omraPackages, omraAllotments } from "@/lib/db/schema"
import { auditEvents } from "@/lib/db/schema"
import { assertProductManager, isValidProductStatus } from "./product-guard"
import { omraProductSchema, omraDepartureSchema, type OmraProductInput, type OmraDepartureInput } from "./schemas/omra-product"
import type { ProductActionResult } from "./packages-actions"

export async function createOmraProduct(input: OmraProductInput): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = omraProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [inserted] = await tx
          .insert(omraPackages)
          .values({
            agencyId: ctx.agencyId,
            type: data.type,
            name: data.name,
            description: data.description || undefined,
            durationDays: data.durationDays,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            basePrice: data.basePrice.toFixed(3),
            includesVisa: data.includesVisa,
            includesFlights: data.includesFlights,
            includesHotels: data.includesHotels,
            includesTransfers: data.includesTransfers,
            includesZiarat: data.includesZiarat,
            includesGuide: data.includesGuide,
            maxPilgrims: data.maxPilgrims,
            minPilgrims: data.minPilgrims,
            metadata: data.metadata,
            status: "draft",
            channels: data.channels,
          })
          .returning({ id: omraPackages.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "omra_package",
          entityId: inserted.id,
          action: "product.created",
          diff: { name: data.name, type: data.type },
        })

        return inserted
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function updateOmraProduct(
  productId: string,
  input: OmraProductInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = omraProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [updated] = await tx
          .update(omraPackages)
          .set({
            type: data.type,
            name: data.name,
            description: data.description || undefined,
            durationDays: data.durationDays,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            basePrice: data.basePrice.toFixed(3),
            includesVisa: data.includesVisa,
            includesFlights: data.includesFlights,
            includesHotels: data.includesHotels,
            includesTransfers: data.includesTransfers,
            includesZiarat: data.includesZiarat,
            includesGuide: data.includesGuide,
            maxPilgrims: data.maxPilgrims,
            minPilgrims: data.minPilgrims,
            metadata: data.metadata,
            channels: data.channels,
            updatedAt: new Date(),
          })
          .where(and(eq(omraPackages.id, productId), eq(omraPackages.agencyId, ctx.agencyId)))
          .returning({ id: omraPackages.id })
        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "omra_package",
          entityId: productId,
          action: "product.updated",
          diff: { name: data.name },
        })
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: productId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function setOmraProductStatus(productId: string, status: string): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!isValidProductStatus(status)) return { ok: false, error: "Statut invalide" }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [updated] = await tx
          .update(omraPackages)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(omraPackages.id, productId), eq(omraPackages.agencyId, ctx.agencyId)))
          .returning({ id: omraPackages.id })
        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "omra_package",
          entityId: productId,
          action: `product.${status}`,
          diff: { status },
        })
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: productId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function duplicateOmraProduct(productId: string): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [original] = await tx
          .select()
          .from(omraPackages)
          .where(and(eq(omraPackages.id, productId), eq(omraPackages.agencyId, ctx.agencyId)))
          .limit(1)
        if (!original) throw new Error("PRODUCT_NOT_FOUND")

        const [inserted] = await tx
          .insert(omraPackages)
          .values({
            agencyId: ctx.agencyId,
            type: original.type,
            name: `${original.name} (copie)`,
            description: original.description,
            durationDays: original.durationDays,
            validFrom: original.validFrom,
            validUntil: original.validUntil,
            basePrice: original.basePrice,
            includesVisa: original.includesVisa,
            includesFlights: original.includesFlights,
            includesHotels: original.includesHotels,
            includesTransfers: original.includesTransfers,
            includesZiarat: original.includesZiarat,
            includesGuide: original.includesGuide,
            maxPilgrims: original.maxPilgrims,
            minPilgrims: original.minPilgrims,
            metadata: original.metadata,
            status: "draft",
            channels: original.channels,
          })
          .returning({ id: omraPackages.id })
        // Volontairement PAS de copie de omra_allotments (départs) — un
        // duplicata part sans date programmée, ni de omra_pilgrims/
        // reservations (aucune FK de ces tables vers un duplicata possible :
        // elles pointent une réservation précise, jamais un package).

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "omra_package",
          entityId: inserted.id,
          action: "product.duplicated",
          diff: { sourceId: productId },
        })

        return inserted
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function createOmraDeparture(
  productId: string,
  input: OmraDepartureInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = omraDepartureSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [product] = await tx
          .select({ id: omraPackages.id })
          .from(omraPackages)
          .where(and(eq(omraPackages.id, productId), eq(omraPackages.agencyId, ctx.agencyId)))
          .limit(1)
        if (!product) throw new Error("PRODUCT_NOT_FOUND")

        const [inserted] = await tx
          .insert(omraAllotments)
          .values({
            packageId: productId,
            departureDate: data.departureDate,
            totalCapacity: data.totalCapacity,
            reservedCount: 0,
            confirmedCount: 0,
            blockedCount: 0,
            availableCount: data.totalCapacity,
            overridePrice: data.overridePrice != null ? data.overridePrice.toFixed(3) : undefined,
            bookingDeadline: data.bookingDeadline || undefined,
            status: "active",
          })
          .returning({ id: omraAllotments.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "omra_allotment",
          entityId: inserted.id,
          action: "departure.created",
          diff: { productId, departureDate: data.departureDate },
        })

        return inserted
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export async function setOmraDepartureStatus(
  allotmentId: string,
  status: "active" | "closed",
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        // omra_allotments n'a pas de colonne agency_id directe — on
        // vérifie l'appartenance via une jointure sur omra_packages, même
        // modèle que la policy RLS 0021_omra_remaining_rls.sql.
        const rows = await tx
          .select({ id: omraAllotments.id, packageId: omraAllotments.packageId })
          .from(omraAllotments)
          .innerJoin(omraPackages, eq(omraPackages.id, omraAllotments.packageId))
          .where(and(eq(omraAllotments.id, allotmentId), eq(omraPackages.agencyId, ctx.agencyId)))
          .limit(1)
        if (!rows[0]) throw new Error("DEPARTURE_NOT_FOUND")

        await tx.update(omraAllotments).set({ status, updatedAt: new Date() }).where(eq(omraAllotments.id, allotmentId))
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: allotmentId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}
