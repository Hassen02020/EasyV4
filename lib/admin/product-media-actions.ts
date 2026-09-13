"use server"

/**
 * Media System (mission Media) — Server Actions upload/suppression/
 * réordonnancement/couverture/remplacement, communes aux 3 modules cibles
 * (Omraty / Voyages Organisés / Attractions, mission §1).
 *
 * Même garde d'autorisation que les autres Product Builders
 * (`assertProductManager`) — aucune logique de rôle parallèle inventée
 * (mission §31). Référence polymorphique `module` + `productId` vérifiée
 * "à la main" contre la table catalogue réelle du module (pas de FK
 * possible, voir lib/db/schema/media.ts) avant toute écriture.
 */

import { randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  productMedia,
  omraPackages,
  catalogPackages,
  catalogActivities,
  auditEvents,
  type ProductMediaVariants,
} from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import { PRODUCT_MEDIA_MODULES, type ProductMediaModule } from "./product-constants"
import {
  validateImageBuffer,
  generateMediaVariants,
  MediaValidationError,
  type MediaVariantName,
} from "@/lib/media/optimize"
import { getMediaStorage } from "@/lib/media/storage"
import { reassignCoverAfterDelete, isValidReorderSet, setCoverAtomic } from "@/lib/media/media-core"

export type ProductMediaActionResult<T = { id: string }> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Référence polymorphique module -> table catalogue                          */
/* -------------------------------------------------------------------------- */

const MODULE_TABLE = {
  omra: omraPackages,
  package: catalogPackages,
  activity: catalogActivities,
} as const

async function assertProductOwnership(
  tx: DrizzleTransaction,
  module: ProductMediaModule,
  productId: string,
  agencyId: string,
): Promise<void> {
  const table = MODULE_TABLE[module]
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, productId), eq(table.agencyId, agencyId)))
    .limit(1)
  if (!row) throw new Error("PRODUCT_NOT_FOUND")
}

function isProductMediaModule(value: string): value is ProductMediaModule {
  return (PRODUCT_MEDIA_MODULES as readonly string[]).includes(value)
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function buildVariantKey(
  agencyId: string,
  module: ProductMediaModule,
  productId: string,
  assetId: string,
  variant: MediaVariantName | "original",
  ext: string,
): string {
  return `media/${agencyId}/${module}/${productId}/${assetId}/${variant}.${ext}`
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `formData` attend : `module`, `productId`, `file`.
 * Pipeline complet mission §9 : validation client déjà faite côté UI, mais
 * REVALIDÉE ici intégralement (type MIME réel, dimensions, taille) — jamais
 * confiance dans ce que le navigateur a déclaré.
 */
export async function uploadProductMedia(formData: FormData): Promise<ProductMediaActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const moduleRaw = String(formData.get("module") ?? "")
  const productId = String(formData.get("productId") ?? "")
  const file = formData.get("file")

  if (!isProductMediaModule(moduleRaw)) return { ok: false, error: "Module invalide" }
  if (!productId) return { ok: false, error: "Produit manquant" }
  if (!(file instanceof File)) return { ok: false, error: "Fichier manquant" }

  // `module` est un identifiant réservé par Next.js pour les fichiers
  // "use server" (règle @next/next/no-assign-module-variable) — jamais
  // l'utiliser comme nom de variable locale ici, d'où `mediaModule`.
  const mediaModule = moduleRaw

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return { ok: false, error: "Fichier illisible" }
  }

  let validated
  try {
    validated = await validateImageBuffer(buffer, file.type)
  } catch (e) {
    if (e instanceof MediaValidationError) return { ok: false, error: e.code }
    return { ok: false, error: "Validation impossible" }
  }

  let variants
  try {
    variants = await generateMediaVariants(buffer)
  } catch {
    return { ok: false, error: "Échec de l'optimisation de l'image" }
  }

  const assetId = randomUUID()
  const originalExt = MIME_TO_EXT[validated.mimeType]
  const originalKey = buildVariantKey(ctx.agencyId, mediaModule, productId, assetId, "original", originalExt)
  const variantKeys: Record<MediaVariantName, string> = {
    large: buildVariantKey(ctx.agencyId, mediaModule, productId, assetId, "large", "webp"),
    medium: buildVariantKey(ctx.agencyId, mediaModule, productId, assetId, "medium", "webp"),
    card: buildVariantKey(ctx.agencyId, mediaModule, productId, assetId, "card", "webp"),
    thumbnail: buildVariantKey(ctx.agencyId, mediaModule, productId, assetId, "thumbnail", "webp"),
  }

  const storage = getMediaStorage()
  const uploaded: string[] = []
  try {
    await storage.put(originalKey, buffer, validated.mimeType)
    uploaded.push(originalKey)
    for (const [name, key] of Object.entries(variantKeys) as [MediaVariantName, string][]) {
      await storage.put(key, variants[name].buffer, "image/webp")
      uploaded.push(key)
    }
  } catch (e) {
    // Nettoyage best-effort de ce qui a déjà été écrit — jamais de fichier
    // orphelin référencé nulle part en DB (mission §11/§20 : clés uniques
    // par upload, donc sûr à nettoyer sans affecter d'autres médias).
    await storage.remove(uploaded).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Échec de l'upload vers le stockage" }
  }

  const mediaVariants: ProductMediaVariants = {
    original: originalKey,
    large: variantKeys.large,
    medium: variantKeys.medium,
    card: variantKeys.card,
    thumbnail: variantKeys.thumbnail,
  }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        await assertProductOwnership(tx, mediaModule, productId, ctx.agencyId)

        const existing = await tx
          .select({ id: productMedia.id })
          .from(productMedia)
          .where(and(eq(productMedia.module, mediaModule), eq(productMedia.productId, productId)))

        const [inserted] = await tx
          .insert(productMedia)
          .values({
            agencyId: ctx.agencyId,
            module: mediaModule,
            productId,
            storageKey: originalKey,
            variants: mediaVariants,
            originalFilename: file.name.slice(0, 255),
            mimeType: validated.mimeType,
            fileSize: buffer.byteLength,
            width: validated.width,
            height: validated.height,
            sortOrder: existing.length,
            // Première image du produit -> couverture par défaut (mission §17).
            isCover: existing.length === 0,
          })
          .returning({ id: productMedia.id })

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "product_media",
          entityId: inserted.id,
          action: "media.uploaded",
          diff: { module: mediaModule, productId, storageKey: originalKey },
        })

        return inserted
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: result }
  } catch (e) {
    // La ligne DB n'a pas pu être créée (produit introuvable, etc.) —
    // les fichiers déjà uploadés seraient orphelins, on les retire.
    await storage.remove(uploaded).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Suppression                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Supprime la ligne DB (+ réassigne la couverture si besoin, mission §17)
 * PUIS les fichiers Storage. Jamais l'inverse : si la suppression Storage
 * échoue, on préfère un fichier orphelin (nettoyable) à une ligne DB
 * pointant vers rien (mission §20 : solution simple et fiable, pas de
 * garbage-collector complexe pour ce V1).
 */
export async function deleteProductMedia(mediaId: string): Promise<ProductMediaActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  let keysToRemove: string[] = []
  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(productMedia)
          .where(and(eq(productMedia.id, mediaId), eq(productMedia.agencyId, ctx.agencyId)))
          .limit(1)
        if (!row) throw new Error("MEDIA_NOT_FOUND")

        await tx.delete(productMedia).where(eq(productMedia.id, mediaId))

        if (row.isCover) {
          // Promeut le premier média restant en couverture — sans effet (donc
          // zéro couverture, explicitement permis) s'il n'en reste aucun.
          await reassignCoverAfterDelete(tx, row.module as ProductMediaModule, row.productId)
        }

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "product_media",
          entityId: mediaId,
          action: "media.deleted",
          diff: { module: row.module, productId: row.productId },
        })

        keysToRemove = Object.values(row.variants).filter((v): v is string => Boolean(v))
        if (!keysToRemove.includes(row.storageKey)) keysToRemove.push(row.storageKey)
      },
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }

  const storage = getMediaStorage()
  await storage.remove(keysToRemove).catch(() => {
    // Best-effort : la DB est déjà cohérente (ligne supprimée), un fichier
    // Storage orphelin n'est pas une incohérence visible côté produit.
  })

  revalidatePath("/admin/products")
  return { ok: true, data: { id: mediaId } }
}

/* -------------------------------------------------------------------------- */
/* Réordonnancement                                                           */
/* -------------------------------------------------------------------------- */

export async function reorderProductMedia(
  module: string,
  productId: string,
  orderedMediaIds: string[],
): Promise<ProductMediaActionResult<{ count: number }>> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!isProductMediaModule(module)) return { ok: false, error: "Module invalide" }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        await assertProductOwnership(tx, module, productId, ctx.agencyId)

        const existing = await tx
          .select({ id: productMedia.id })
          .from(productMedia)
          .where(and(eq(productMedia.module, module), eq(productMedia.productId, productId)))

        if (!isValidReorderSet(existing.map((r) => r.id), orderedMediaIds)) {
          // La liste envoyée ne correspond pas EXACTEMENT aux médias réels de
          // ce produit — jamais appliquer un ordre partiel ou pointant vers
          // un média d'un autre produit/agence (mission §26 : tests sécurité).
          throw new Error("MEDIA_SET_MISMATCH")
        }

        await Promise.all(
          orderedMediaIds.map((id, index) =>
            tx
              .update(productMedia)
              .set({ sortOrder: index, updatedAt: new Date() })
              .where(and(eq(productMedia.id, id), eq(productMedia.agencyId, ctx.agencyId))),
          ),
        )
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { count: orderedMediaIds.length } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Couverture                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Une seule couverture par produit (index unique partiel, mission §17).
 * Deux UPDATE distincts dans la même transaction : on retire d'abord la
 * couverture existante (aucune ligne à is_cover=true après cette étape),
 * puis on pose la nouvelle — jamais les deux vraies en même temps, jamais
 * de conflit avec `product_media_one_cover_uniq`.
 */
export async function setCoverProductMedia(mediaId: string): Promise<ProductMediaActionResult> {
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
        const [row] = await tx
          .select({ module: productMedia.module, productId: productMedia.productId })
          .from(productMedia)
          .where(and(eq(productMedia.id, mediaId), eq(productMedia.agencyId, ctx.agencyId)))
          .limit(1)
        if (!row) throw new Error("MEDIA_NOT_FOUND")

        await setCoverAtomic(tx, row.module as ProductMediaModule, row.productId, mediaId)
      },
    )
    revalidatePath("/admin/products")
    return { ok: true, data: { id: mediaId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* Remplacement                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Remplace le contenu d'un média existant SANS perdre sa position
 * (sortOrder) ni son statut de couverture. Ordre mission §19 : upload du
 * nouveau (sous un nouvel assetId, donc jamais d'écrasement) -> validation
 * -> la ligne DB pointe vers le nouveau contenu -> SEULEMENT ENSUITE
 * suppression de l'ancien Storage.
 */
export async function replaceProductMedia(
  mediaId: string,
  formData: FormData,
): Promise<ProductMediaActionResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const file = formData.get("file")
  if (!(file instanceof File)) return { ok: false, error: "Fichier manquant" }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return { ok: false, error: "Fichier illisible" }
  }

  let validated
  try {
    validated = await validateImageBuffer(buffer, file.type)
  } catch (e) {
    if (e instanceof MediaValidationError) return { ok: false, error: e.code }
    return { ok: false, error: "Validation impossible" }
  }

  let variants
  try {
    variants = await generateMediaVariants(buffer)
  } catch {
    return { ok: false, error: "Échec de l'optimisation de l'image" }
  }

  const storage = getMediaStorage()

  // Étape 1 : charge la ligne existante (pour connaître module/productId et
  // les anciennes clés à supprimer plus tard).
  let oldRow
  try {
    oldRow = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(productMedia)
          .where(and(eq(productMedia.id, mediaId), eq(productMedia.agencyId, ctx.agencyId)))
          .limit(1)
        if (!row) throw new Error("MEDIA_NOT_FOUND")
        return row
      },
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }

  const assetId = randomUUID()
  const originalExt = MIME_TO_EXT[validated.mimeType]
  // `module` est une colonne varchar (contrainte CHECK en base, pas un enum
  // Drizzle — voir lib/db/schema/media.ts) : la valeur lue est garantie
  // valide par cette contrainte, d'où l'assertion de type ici.
  const oldModule = oldRow.module as ProductMediaModule
  const originalKey = buildVariantKey(ctx.agencyId, oldModule, oldRow.productId, assetId, "original", originalExt)
  const variantKeys: Record<MediaVariantName, string> = {
    large: buildVariantKey(ctx.agencyId, oldModule, oldRow.productId, assetId, "large", "webp"),
    medium: buildVariantKey(ctx.agencyId, oldModule, oldRow.productId, assetId, "medium", "webp"),
    card: buildVariantKey(ctx.agencyId, oldModule, oldRow.productId, assetId, "card", "webp"),
    thumbnail: buildVariantKey(ctx.agencyId, oldModule, oldRow.productId, assetId, "thumbnail", "webp"),
  }

  // Étape 2 : upload du NOUVEAU contenu — l'ancien reste intact et servi
  // normalement pendant toute cette étape.
  const uploaded: string[] = []
  try {
    await storage.put(originalKey, buffer, validated.mimeType)
    uploaded.push(originalKey)
    for (const [name, key] of Object.entries(variantKeys) as [MediaVariantName, string][]) {
      await storage.put(key, variants[name].buffer, "image/webp")
      uploaded.push(key)
    }
  } catch (e) {
    await storage.remove(uploaded).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Échec de l'upload vers le stockage" }
  }

  const mediaVariants: ProductMediaVariants = {
    original: originalKey,
    large: variantKeys.large,
    medium: variantKeys.medium,
    card: variantKeys.card,
    thumbnail: variantKeys.thumbnail,
  }

  // Étape 3 : la ligne DB bascule sur le nouveau contenu.
  try {
    await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const [updated] = await tx
          .update(productMedia)
          .set({
            storageKey: originalKey,
            variants: mediaVariants,
            originalFilename: file.name.slice(0, 255),
            mimeType: validated.mimeType,
            fileSize: buffer.byteLength,
            width: validated.width,
            height: validated.height,
            updatedAt: new Date(),
          })
          .where(and(eq(productMedia.id, mediaId), eq(productMedia.agencyId, ctx.agencyId)))
          .returning({ id: productMedia.id })
        if (!updated) throw new Error("MEDIA_NOT_FOUND")

        await tx.insert(auditEvents).values({
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: "product_media",
          entityId: mediaId,
          action: "media.replaced",
          diff: { module: oldRow.module, productId: oldRow.productId, newStorageKey: originalKey },
        })
      },
    )
  } catch (e) {
    // La ligne DB n'a pas basculé — le nouveau contenu uploadé est orphelin,
    // l'ancien reste la source de vérité valide.
    await storage.remove(uploaded).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : "Erreur interne" }
  }

  // Étape 4 : SEULEMENT MAINTENANT, l'ancien contenu peut être supprimé.
  const oldKeys = Object.values(oldRow.variants).filter((v): v is string => Boolean(v))
  if (!oldKeys.includes(oldRow.storageKey)) oldKeys.push(oldRow.storageKey)
  await storage.remove(oldKeys).catch(() => {})

  revalidatePath("/admin/products")
  return { ok: true, data: { id: mediaId } }
}
