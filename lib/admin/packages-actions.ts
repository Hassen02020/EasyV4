"use server"

/**
 * Master Admin Product Builder — Voyages Organisés (Phase 13).
 *
 * Ferme le plus grand gap identifié par la revue de la Phase 12 : le moteur
 * de réservation Packages (lib/packages/booking-actions.ts) existe et
 * fonctionne, mais rien ne permettait à un admin de créer le produit qu'il
 * vend — `catalog_packages`/`catalog_package_departures` étaient
 * entièrement vides en production (confirmé avant d'appliquer la migration
 * 0022). Ce fichier est le premier chemin d'écriture jamais créé pour ces
 * deux tables (confirmé par recherche avant Phase 13 : zéro
 * `insert(catalogPackages)`/`update(catalogPackages)` nulle part dans le
 * dépôt hors ce fichier).
 *
 * Duplication de produit : ne copie JAMAIS les réservations, clients,
 * paiements, factures ou vouchers — uniquement la configuration du produit
 * (catalog_packages), jamais `catalog_package_departures` (les dates d'un
 * duplicata n'ont aucune raison d'être identiques à l'original) ni
 * évidemment `reservations`/`reservation_package`/`payments` (aucune de ces
 * tables n'a de FK vers `catalog_packages`, donc structurellement rien à
 * dupliquer par accident).
 */

import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogPackageDepartures, auditEvents } from "@/lib/db/schema"
import { assertProductManager, isValidProductStatus, type ProductChannel } from "./product-guard"
import { packageProductSchema, packageDepartureSchema, type PackageProductInput, type PackageDepartureInput } from "./schemas/package-product"

export type ProductActionResult<T = { id: string }> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 190)
}

/* -------------------------------------------------------------------------- */
/* Create / Update                                                            */
/* -------------------------------------------------------------------------- */

export async function createPackageProduct(input: PackageProductInput): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = packageProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const slug = slugify(data.title)
        const [inserted] = await tx
          .insert(catalogPackages)
          .values({
            agencyId: ctx.agencyId,
            code: data.code,
            title: data.title,
            slug,
            shortDescription: data.shortDescription || undefined,
            longDescription: data.longDescription || undefined,
            itinerary: data.itinerary ?? undefined,
            coverImage: data.coverImage || undefined,
            galleryUrls: data.galleryUrls,
            departureLocations: data.departureLocations,
            transportMode: data.transportMode || undefined,
            durationDays: data.durationDays,
            durationNights: data.durationNights,
            inclusions: data.inclusions,
            exclusions: data.exclusions,
            status: "draft",
            channels: data.channels,
          })
          .returning({ id: catalogPackages.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_package",
          entityId: inserted.id,
          action: "product.created",
          diff: { title: data.title, code: data.code },
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

export async function updatePackageProduct(
  productId: string,
  input: PackageProductInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = packageProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [updated] = await tx
          .update(catalogPackages)
          .set({
            code: data.code,
            title: data.title,
            shortDescription: data.shortDescription || undefined,
            longDescription: data.longDescription || undefined,
            itinerary: data.itinerary ?? undefined,
            coverImage: data.coverImage || undefined,
            galleryUrls: data.galleryUrls,
            departureLocations: data.departureLocations,
            transportMode: data.transportMode || undefined,
            durationDays: data.durationDays,
            durationNights: data.durationNights,
            inclusions: data.inclusions,
            exclusions: data.exclusions,
            channels: data.channels,
            updatedAt: new Date(),
          })
          .where(and(eq(catalogPackages.id, productId), eq(catalogPackages.agencyId, ctx.agencyId)))
          .returning({ id: catalogPackages.id })

        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_package",
          entityId: productId,
          action: "product.updated",
          diff: { title: data.title },
        })
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: productId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Lifecycle : publish / suspend / archive                                    */
/* -------------------------------------------------------------------------- */

export async function setPackageProductStatus(
  productId: string,
  status: string,
): Promise<ProductActionResult> {
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
          .update(catalogPackages)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(catalogPackages.id, productId), eq(catalogPackages.agencyId, ctx.agencyId)))
          .returning({ id: catalogPackages.id })
        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_package",
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

/* -------------------------------------------------------------------------- */
/* Duplicate — configuration uniquement, jamais les réservations              */
/* -------------------------------------------------------------------------- */

export async function duplicatePackageProduct(productId: string): Promise<ProductActionResult> {
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
          .from(catalogPackages)
          .where(and(eq(catalogPackages.id, productId), eq(catalogPackages.agencyId, ctx.agencyId)))
          .limit(1)
        if (!original) throw new Error("PRODUCT_NOT_FOUND")

        const copyTitle = `${original.title} (copie)`
        const [inserted] = await tx
          .insert(catalogPackages)
          .values({
            agencyId: ctx.agencyId,
            code: `${original.code}-COPY`,
            title: copyTitle,
            slug: slugify(`${copyTitle}-${Date.now()}`),
            shortDescription: original.shortDescription,
            longDescription: original.longDescription,
            itinerary: original.itinerary,
            coverImage: original.coverImage,
            galleryUrls: original.galleryUrls,
            departureLocations: original.departureLocations,
            transportMode: original.transportMode,
            durationDays: original.durationDays,
            durationNights: original.durationNights,
            inclusions: original.inclusions,
            exclusions: original.exclusions,
            status: "draft",
            channels: original.channels,
          })
          .returning({ id: catalogPackages.id })
        // Volontairement PAS de copie de catalog_package_departures : un
        // duplicata démarre sans départ programmé, l'admin en crée de
        // nouveaux avec ses propres dates/prix/stock.

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_package",
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

/* -------------------------------------------------------------------------- */
/* Départs (disponibilité + prix)                                             */
/* -------------------------------------------------------------------------- */

export async function createPackageDeparture(
  productId: string,
  input: PackageDepartureInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = packageDepartureSchema.safeParse(input)
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
          .select({ id: catalogPackages.id })
          .from(catalogPackages)
          .where(and(eq(catalogPackages.id, productId), eq(catalogPackages.agencyId, ctx.agencyId)))
          .limit(1)
        if (!product) throw new Error("PRODUCT_NOT_FOUND")

        const [inserted] = await tx
          .insert(catalogPackageDepartures)
          .values({
            agencyId: ctx.agencyId,
            packageId: productId,
            departureDate: data.departureDate,
            returnDate: data.returnDate,
            adultPriceTnd: data.adultPriceTnd.toFixed(2),
            childPriceTnd: data.childPriceTnd != null ? data.childPriceTnd.toFixed(2) : undefined,
            depositPercent: data.depositPercent,
            totalSeats: data.totalSeats,
            bookedSeats: 0,
            status: "open",
          })
          .returning({ id: catalogPackageDepartures.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_package_departure",
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

export async function setPackageDepartureStatus(
  departureId: string,
  status: "open" | "closed",
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
        const [updated] = await tx
          .update(catalogPackageDepartures)
          .set({ status })
          .where(
            and(
              eq(catalogPackageDepartures.id, departureId),
              eq(catalogPackageDepartures.agencyId, ctx.agencyId),
            ),
          )
          .returning({ id: catalogPackageDepartures.id })
        if (!updated) throw new Error("DEPARTURE_NOT_FOUND")
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: departureId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

export type { ProductChannel }
