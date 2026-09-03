"use server"

/**
 * Master Admin Product Builder — Attractions (Phase 13).
 *
 * `catalog_activities`/`catalog_activity_sessions` (Attractions) et
 * `catalog_packages`/`catalog_package_departures` (Packages, Phase 12) ont
 * une forme quasi identique — même origine de schéma (squelette catalogue
 * générique documenté "itérations 5-9" dans lib/db/schema.ts). Ce fichier
 * suit donc exactement le même patron que packages-actions.ts.
 *
 * Ce fichier construit la gestion CATALOGUE (créer/publier/suspendre/
 * dupliquer une attraction, gérer ses sessions — voir aussi
 * createActivitySession plus bas et components/admin/activity-session-manager.tsx).
 * Le moteur de réservation B2C (Phase 13.1, gap #1) est un fichier séparé :
 * lib/activities/guest-booking-actions.ts::createGuestActivityBooking,
 * appelé depuis app/attractions/[slug]/book/page.tsx via
 * ActivityGuestBookingForm — il écrit bien dans `reservation_activity`.
 * (Note historique : une version antérieure de ce commentaire affirmait
 * qu'aucun moteur de réservation n'existait encore — c'était vrai au
 * moment de la Phase 13, plus depuis que la Phase 13.1 a comblé ce gap.)
 */

import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import { catalogActivities, catalogActivitySessions, auditEvents } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import { isValidProductStatus } from "./product-constants"
import { activityProductSchema, activitySessionSchema, type ActivityProductInput, type ActivitySessionInput } from "./schemas/activity-product"
import type { ProductActionResult } from "./packages-actions"

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 190)
}

export async function createActivityProduct(input: ActivityProductInput): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = activityProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [inserted] = await tx
          .insert(catalogActivities)
          .values({
            agencyId: ctx.agencyId,
            code: data.code,
            title: data.title,
            slug: slugify(data.title),
            shortDescription: data.shortDescription || undefined,
            longDescription: data.longDescription || undefined,
            location: data.location || undefined,
            durationMinutes: data.durationMinutes,
            coverImage: data.coverImage || undefined,
            galleryUrls: data.galleryUrls,
            inclusions: data.inclusions,
            exclusions: data.exclusions,
            status: "draft",
            channels: data.channels,
          })
          .returning({ id: catalogActivities.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_activity",
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

export async function updateActivityProduct(
  productId: string,
  input: ActivityProductInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const parsed = activityProductSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const data = parsed.data

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [updated] = await tx
          .update(catalogActivities)
          .set({
            code: data.code,
            title: data.title,
            location: data.location || undefined,
            shortDescription: data.shortDescription || undefined,
            longDescription: data.longDescription || undefined,
            durationMinutes: data.durationMinutes,
            coverImage: data.coverImage || undefined,
            galleryUrls: data.galleryUrls,
            inclusions: data.inclusions,
            exclusions: data.exclusions,
            channels: data.channels,
            updatedAt: new Date(),
          })
          .where(and(eq(catalogActivities.id, productId), eq(catalogActivities.agencyId, ctx.agencyId)))
          .returning({ id: catalogActivities.id })
        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_activity",
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

export async function setActivityProductStatus(productId: string, status: string): Promise<ProductActionResult> {
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
          .update(catalogActivities)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(catalogActivities.id, productId), eq(catalogActivities.agencyId, ctx.agencyId)))
          .returning({ id: catalogActivities.id })
        if (!updated) throw new Error("PRODUCT_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_activity",
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

export async function duplicateActivityProduct(productId: string): Promise<ProductActionResult> {
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
          .from(catalogActivities)
          .where(and(eq(catalogActivities.id, productId), eq(catalogActivities.agencyId, ctx.agencyId)))
          .limit(1)
        if (!original) throw new Error("PRODUCT_NOT_FOUND")

        const copyTitle = `${original.title} (copie)`
        const [inserted] = await tx
          .insert(catalogActivities)
          .values({
            agencyId: ctx.agencyId,
            code: `${original.code}-COPY`,
            title: copyTitle,
            slug: slugify(`${copyTitle}-${Date.now()}`),
            location: original.location,
            shortDescription: original.shortDescription,
            longDescription: original.longDescription,
            durationMinutes: original.durationMinutes,
            coverImage: original.coverImage,
            galleryUrls: original.galleryUrls,
            inclusions: original.inclusions,
            exclusions: original.exclusions,
            status: "draft",
            channels: original.channels,
          })
          .returning({ id: catalogActivities.id })
        // Volontairement PAS de copie de catalog_activity_sessions.

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_activity",
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

export async function createActivitySession(
  productId: string,
  input: ActivitySessionInput,
): Promise<ProductActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  const parsed = activitySessionSchema.safeParse(input)
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
          .select({ id: catalogActivities.id })
          .from(catalogActivities)
          .where(and(eq(catalogActivities.id, productId), eq(catalogActivities.agencyId, ctx.agencyId)))
          .limit(1)
        if (!product) throw new Error("PRODUCT_NOT_FOUND")

        const [inserted] = await tx
          .insert(catalogActivitySessions)
          .values({
            agencyId: ctx.agencyId,
            activityId: productId,
            sessionDate: data.sessionDate,
            sessionStart: data.sessionStart,
            sessionEnd: data.sessionEnd,
            capacity: data.capacity,
            booked: 0,
            adultPriceTnd: data.adultPriceTnd.toFixed(2),
            childPriceTnd: data.childPriceTnd != null ? data.childPriceTnd.toFixed(2) : undefined,
            seniorPriceTnd: data.seniorPriceTnd != null ? data.seniorPriceTnd.toFixed(2) : undefined,
            status: "open",
          })
          .returning({ id: catalogActivitySessions.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "catalog_activity_session",
          entityId: inserted.id,
          action: "session.created",
          diff: { productId, sessionDate: data.sessionDate },
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
