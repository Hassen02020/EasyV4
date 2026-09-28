"use server"

/**
 * Chantier "Mutuelle" — étape 2 : canal B2B2C réel (catalogue privé), voir
 * drizzle/manual/0063_mutuelle_catalog.sql et lib/mutuelle/requests-actions.ts
 * (cycle demande→validation, déjà en place, hors scope ici).
 *
 * Portée : le directeur choisit, PARMI le catalogue réellement PUBLIÉ de
 * l'agence d'exécution de son groupe (catalog_packages / catalog_activities /
 * omra_packages — seuls modules "catalogue" existants ; Hôtels/Vols sont de
 * l'inventaire live fournisseur, non curatable ici), les produits visibles
 * par ses membres. Le membre ne voit ensuite QUE ce catalogue restreint, prix
 * public + prix Mutuelle (markup de convention) affichés côte à côte quand
 * un prix public réel existe. AUCUNE réservation, AUCUNE facturation
 * déclenchée par ce fichier — chantiers suivants explicites.
 *
 * RLS : catalog_packages/catalog_activities/omra_packages restent scopées
 * par agence (`agency_id = current_agency_id()`), donc toute lecture/écriture
 * qui les touche doit poser `app.current_agency_id` sur l'agence
 * D'EXÉCUTION du groupe (`group.executionAgencyId`), jamais l'agence
 * "domicile" du directeur/membre — voir getGroupExecutionContext(). Comme
 * ailleurs dans ce chantier (0061), la distinction de rôle reste vérifiée
 * ici, jamais uniquement par RLS.
 */

import { revalidatePath } from "next/cache"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  mutuelleCatalogItems,
  mutuelleGroups,
  auditEvents,
  catalogPackages,
  catalogPackageDepartures,
  catalogActivities,
  catalogActivitySessions,
} from "@/lib/db/schema"
import { omraPackages } from "@/lib/db/schema/omra"
import { requireMutuelleProfile } from "@/lib/mutuelle/requests-actions"
import type { AdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"

type ProductType = "package" | "activity" | "omra"

async function getGroupExecutionContext(
  groupId: string,
  profile: AdminProfile,
  userId: string,
): Promise<{ executionAgencyId: string; markupPercent: string } | null> {
  return withTenantContext(
    { agencyId: profile.agencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
    async (tx) => {
      const [group] = await tx
        .select({ executionAgencyId: mutuelleGroups.executionAgencyId, markupPercent: mutuelleGroups.markupPercent })
        .from(mutuelleGroups)
        .where(eq(mutuelleGroups.id, groupId))
      return group ?? null
    },
  )
}

/* -------------------------------------------------------------------------- */
/* 1. Directeur — parcourir le catalogue de l'agence d'exécution              */
/* -------------------------------------------------------------------------- */

export interface MutuelleCatalogBrowseItem {
  productType: ProductType
  productId: string
  title: string
  status: string
  priceFromTnd: number | null
  enabled: boolean
}

/** Catalogue publié de l'agence d'exécution du groupe + statut d'activation Mutuelle. Directeur uniquement. */
export async function listExecutionAgencyCatalog(): Promise<MutuelleCatalogBrowseItem[]> {
  const auth = await requireMutuelleProfile("mutuelle_director")
  if (!auth.ok) return []
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  const group = await getGroupExecutionContext(groupId, profile, userId)
  if (!group) return []

  return withTenantContext(
    { agencyId: group.executionAgencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
    async (tx) => {
      const [packages, activities, omra, enabledRows] = await Promise.all([
        tx
          .select({ id: catalogPackages.id, title: catalogPackages.title, status: catalogPackages.status })
          .from(catalogPackages)
          .where(and(eq(catalogPackages.agencyId, group.executionAgencyId), eq(catalogPackages.status, "published"))),
        tx
          .select({ id: catalogActivities.id, title: catalogActivities.title, status: catalogActivities.status })
          .from(catalogActivities)
          .where(
            and(eq(catalogActivities.agencyId, group.executionAgencyId), eq(catalogActivities.status, "published")),
          ),
        tx
          .select({ id: omraPackages.id, title: omraPackages.name, status: omraPackages.status, basePrice: omraPackages.basePrice })
          .from(omraPackages)
          .where(and(eq(omraPackages.agencyId, group.executionAgencyId), eq(omraPackages.status, "published"))),
        tx
          .select({ productType: mutuelleCatalogItems.productType, productId: mutuelleCatalogItems.productId })
          .from(mutuelleCatalogItems)
          .where(eq(mutuelleCatalogItems.groupId, groupId)),
      ])

      const enabledKeys = new Set(enabledRows.map((r) => `${r.productType}:${r.productId}`))

      // "À partir de X DT" — agrégé depuis les départs/sessions réels futurs,
      // jamais un prix inventé (même pattern que app/(public)/[locale]/packages/page.tsx).
      const packagePrices = packages.length
        ? await tx
            .select({
              packageId: catalogPackageDepartures.packageId,
              minPrice: sql<string>`MIN(${catalogPackageDepartures.adultPriceTnd})`,
            })
            .from(catalogPackageDepartures)
            .where(
              and(
                inArray(
                  catalogPackageDepartures.packageId,
                  packages.map((p) => p.id),
                ),
                eq(catalogPackageDepartures.status, "open"),
                gte(catalogPackageDepartures.departureDate, sql`CURRENT_DATE`),
              ),
            )
            .groupBy(catalogPackageDepartures.packageId)
        : []
      const packagePriceMap = new Map(packagePrices.map((r) => [r.packageId, parseFloat(r.minPrice)]))

      const activityPrices = activities.length
        ? await tx
            .select({
              activityId: catalogActivitySessions.activityId,
              minPrice: sql<string>`MIN(${catalogActivitySessions.adultPriceTnd})`,
            })
            .from(catalogActivitySessions)
            .where(
              and(
                inArray(
                  catalogActivitySessions.activityId,
                  activities.map((a) => a.id),
                ),
                eq(catalogActivitySessions.status, "open"),
                gte(catalogActivitySessions.sessionDate, sql`CURRENT_DATE`),
              ),
            )
            .groupBy(catalogActivitySessions.activityId)
        : []
      const activityPriceMap = new Map(activityPrices.map((r) => [r.activityId, parseFloat(r.minPrice)]))

      const items: MutuelleCatalogBrowseItem[] = [
        ...packages.map((p) => ({
          productType: "package" as const,
          productId: p.id,
          title: p.title,
          status: p.status,
          priceFromTnd: packagePriceMap.get(p.id) ?? null,
          enabled: enabledKeys.has(`package:${p.id}`),
        })),
        ...activities.map((a) => ({
          productType: "activity" as const,
          productId: a.id,
          title: a.title,
          status: a.status,
          priceFromTnd: activityPriceMap.get(a.id) ?? null,
          enabled: enabledKeys.has(`activity:${a.id}`),
        })),
        ...omra.map((o) => ({
          productType: "omra" as const,
          productId: o.id,
          title: o.title,
          status: o.status,
          priceFromTnd: o.basePrice ? parseFloat(o.basePrice) : null,
          enabled: enabledKeys.has(`omra:${o.id}`),
        })),
      ]
      return items.sort((a, b) => a.title.localeCompare(b.title))
    },
  )
}

/* -------------------------------------------------------------------------- */
/* 2. Directeur — activer / désactiver un produit pour son groupe             */
/* -------------------------------------------------------------------------- */

const setCatalogItemSchema = z.object({
  productType: z.enum(["package", "activity", "omra"]),
  productId: z.string().uuid(),
  enabled: z.boolean(),
})

export type SetMutuelleCatalogItemInput = z.infer<typeof setCatalogItemSchema>
export type SetMutuelleCatalogItemResult = { ok: true } | { ok: false; error: string }

export async function setMutuelleCatalogItem(
  raw: SetMutuelleCatalogItemInput,
): Promise<SetMutuelleCatalogItemResult> {
  const parsed = setCatalogItemSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide." }
  const input = parsed.data

  const auth = await requireMutuelleProfile("mutuelle_director")
  if (!auth.ok) return { ok: false, error: auth.error }
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  const group = await getGroupExecutionContext(groupId, profile, userId)
  if (!group) return { ok: false, error: "Groupe Mutuelle introuvable." }

  try {
    // Le produit doit réellement appartenir au catalogue PUBLIÉ de l'agence
    // d'exécution du groupe — jamais un id arbitraire fourni côté client.
    const isValidProduct = await withTenantContext(
      { agencyId: group.executionAgencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
      async (tx) => {
        if (input.productType === "package") {
          const [row] = await tx
            .select({ id: catalogPackages.id })
            .from(catalogPackages)
            .where(
              and(
                eq(catalogPackages.id, input.productId),
                eq(catalogPackages.agencyId, group.executionAgencyId),
                eq(catalogPackages.status, "published"),
              ),
            )
          return !!row
        }
        if (input.productType === "activity") {
          const [row] = await tx
            .select({ id: catalogActivities.id })
            .from(catalogActivities)
            .where(
              and(
                eq(catalogActivities.id, input.productId),
                eq(catalogActivities.agencyId, group.executionAgencyId),
                eq(catalogActivities.status, "published"),
              ),
            )
          return !!row
        }
        const [row] = await tx
          .select({ id: omraPackages.id })
          .from(omraPackages)
          .where(
            and(
              eq(omraPackages.id, input.productId),
              eq(omraPackages.agencyId, group.executionAgencyId),
              eq(omraPackages.status, "published"),
            ),
          )
        return !!row
      },
    )
    if (!isValidProduct) {
      return {
        ok: false,
        error: "Ce produit n'appartient pas au catalogue publié de l'agence d'exécution du groupe.",
      }
    }

    await withTenantContext(
      { agencyId: profile.agencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
      async (tx) => {
        if (input.enabled) {
          await tx
            .insert(mutuelleCatalogItems)
            .values({ groupId, productType: input.productType, productId: input.productId, addedByUserId: userId })
            .onConflictDoNothing()
          await tx.insert(auditEvents).values({
            agencyId: profile.agencyId,
            actorUserId: userId,
            entityType: "mutuelle_catalog_item",
            entityId: input.productId,
            action: "mutuelle_catalog_item.added",
            diff: { productType: input.productType, groupId },
          })
        } else {
          await tx
            .delete(mutuelleCatalogItems)
            .where(
              and(
                eq(mutuelleCatalogItems.groupId, groupId),
                eq(mutuelleCatalogItems.productType, input.productType),
                eq(mutuelleCatalogItems.productId, input.productId),
              ),
            )
          await tx.insert(auditEvents).values({
            agencyId: profile.agencyId,
            actorUserId: userId,
            entityType: "mutuelle_catalog_item",
            entityId: input.productId,
            action: "mutuelle_catalog_item.removed",
            diff: { productType: input.productType, groupId },
          })
        }
      },
    )

    revalidatePath("/mutuelle/catalogue")
    return { ok: true }
  } catch (err) {
    logger.error("[mutuelle-catalog-actions] setMutuelleCatalogItem failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Membre — parcourir SON catalogue restreint (prix public / prix Mutuelle) */
/* -------------------------------------------------------------------------- */

export interface MutuelleCatalogMemberItem {
  productType: ProductType
  productId: string
  title: string
  /** Prix public agence — null si aucun départ/session futur (jamais inventé). */
  priceFromTnd: number | null
  /** Indicatif uniquement (markup de convention) — jamais utilisé pour facturer ici. Null si priceFromTnd est null. */
  mutuellePriceFromTnd: number | null
}

/** Catalogue restreint activé par le directeur pour le groupe du membre courant. */
export async function listMyMutuelleCatalog(): Promise<MutuelleCatalogMemberItem[]> {
  const auth = await requireMutuelleProfile("mutuelle_member")
  if (!auth.ok) return []
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  const group = await getGroupExecutionContext(groupId, profile, userId)
  if (!group) return []
  const markupPercent = parseFloat(group.markupPercent)

  return withTenantContext(
    { agencyId: group.executionAgencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
    async (tx) => {
      const enabledRows = await tx
        .select({ productType: mutuelleCatalogItems.productType, productId: mutuelleCatalogItems.productId })
        .from(mutuelleCatalogItems)
        .where(eq(mutuelleCatalogItems.groupId, groupId))
      if (enabledRows.length === 0) return []

      const packageIds = enabledRows.filter((r) => r.productType === "package").map((r) => r.productId)
      const activityIds = enabledRows.filter((r) => r.productType === "activity").map((r) => r.productId)
      const omraIds = enabledRows.filter((r) => r.productType === "omra").map((r) => r.productId)

      const [packages, activities, omra] = await Promise.all([
        packageIds.length
          ? tx
              .select({ id: catalogPackages.id, title: catalogPackages.title })
              .from(catalogPackages)
              .where(and(inArray(catalogPackages.id, packageIds), eq(catalogPackages.status, "published")))
          : Promise.resolve([]),
        activityIds.length
          ? tx
              .select({ id: catalogActivities.id, title: catalogActivities.title })
              .from(catalogActivities)
              .where(and(inArray(catalogActivities.id, activityIds), eq(catalogActivities.status, "published")))
          : Promise.resolve([]),
        omraIds.length
          ? tx
              .select({ id: omraPackages.id, title: omraPackages.name, basePrice: omraPackages.basePrice })
              .from(omraPackages)
              .where(and(inArray(omraPackages.id, omraIds), eq(omraPackages.status, "published")))
          : Promise.resolve([]),
      ])

      const packagePrices = packages.length
        ? await tx
            .select({
              packageId: catalogPackageDepartures.packageId,
              minPrice: sql<string>`MIN(${catalogPackageDepartures.adultPriceTnd})`,
            })
            .from(catalogPackageDepartures)
            .where(
              and(
                inArray(
                  catalogPackageDepartures.packageId,
                  packages.map((p) => p.id),
                ),
                eq(catalogPackageDepartures.status, "open"),
                gte(catalogPackageDepartures.departureDate, sql`CURRENT_DATE`),
              ),
            )
            .groupBy(catalogPackageDepartures.packageId)
        : []
      const packagePriceMap = new Map(packagePrices.map((r) => [r.packageId, parseFloat(r.minPrice)]))

      const activityPrices = activities.length
        ? await tx
            .select({
              activityId: catalogActivitySessions.activityId,
              minPrice: sql<string>`MIN(${catalogActivitySessions.adultPriceTnd})`,
            })
            .from(catalogActivitySessions)
            .where(
              and(
                inArray(
                  catalogActivitySessions.activityId,
                  activities.map((a) => a.id),
                ),
                eq(catalogActivitySessions.status, "open"),
                gte(catalogActivitySessions.sessionDate, sql`CURRENT_DATE`),
              ),
            )
            .groupBy(catalogActivitySessions.activityId)
        : []
      const activityPriceMap = new Map(activityPrices.map((r) => [r.activityId, parseFloat(r.minPrice)]))

      function withMutuellePrice(priceFromTnd: number | null): number | null {
        if (priceFromTnd == null) return null
        return Math.round(priceFromTnd * (1 + markupPercent / 100) * 100) / 100
      }

      const items: MutuelleCatalogMemberItem[] = [
        ...packages.map((p) => {
          const priceFromTnd = packagePriceMap.get(p.id) ?? null
          return {
            productType: "package" as const,
            productId: p.id,
            title: p.title,
            priceFromTnd,
            mutuellePriceFromTnd: withMutuellePrice(priceFromTnd),
          }
        }),
        ...activities.map((a) => {
          const priceFromTnd = activityPriceMap.get(a.id) ?? null
          return {
            productType: "activity" as const,
            productId: a.id,
            title: a.title,
            priceFromTnd,
            mutuellePriceFromTnd: withMutuellePrice(priceFromTnd),
          }
        }),
        ...omra.map((o) => {
          const priceFromTnd = o.basePrice ? parseFloat(o.basePrice) : null
          return {
            productType: "omra" as const,
            productId: o.id,
            title: o.title,
            priceFromTnd,
            mutuellePriceFromTnd: withMutuellePrice(priceFromTnd),
          }
        }),
      ]
      return items.sort((a, b) => a.title.localeCompare(b.title))
    },
  )
}
