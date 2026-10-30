/**
 * SITE-PROMO-BANNERS-01 — écriture des promotions et visuels de modules du
 * site public (/admin/site), et lecture admin de TOUTES les promotions.
 *
 * Correctif : la RLS réserve l'écriture de public_promotions et
 * public_module_visuals à is_super_admin() (drizzle/manual/0119). Les actions
 * s'exécutaient avec isSuperAdmin: false → mise à jour d'une promotion =
 * 0 ligne, sans erreur (rien n'avait jamais été modifié en production,
 * updated_at = created_at partout, constaté le 2026-10-30) ; visuel de
 * module = rejet RLS. Désormais : contexte super admin réel (rôle vérifié
 * par l'action) et toute écriture qui ne touche aucune ligne lève une
 * erreur au lieu de réussir en silence.
 *
 * Pas de `server-only` : testé en live contre Postgres (app_runtime).
 */

import { and, asc, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { publicModuleVisuals, publicPromotions } from "@/lib/db/schema"

/** Modules proposés pour une promotion (slugs du site public). */
export const PROMOTION_MODULES = [
  ["hotels-tunisie", "Hôtels Tunisie"],
  ["hotels-monde", "Hôtels Monde"],
  ["omraty", "Omra"],
  ["voyages-organises", "Voyages organisés"],
  ["attractions", "Attractions"],
  ["vols", "Vols"],
  ["transferts", "Transferts"],
  ["car", "Cars"],
] as const

export interface PromotionInput {
  title: string
  subtitle: string | null
  destination: string
  moduleSlug: string
  href: string
  imageUrl: string
  flag: string | null
  enabled: boolean
  sortOrder: number
  startsAt: Date | null
  endsAt: Date | null
}

export type PromotionStatus = "active" | "scheduled" | "expired" | "disabled"

/** Même règle que la lecture publique (getPublicPromotions). */
export function promotionStatus(
  p: { enabled: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): PromotionStatus {
  if (!p.enabled) return "disabled"
  if (p.startsAt && p.startsAt > now) return "scheduled"
  if (p.endsAt && p.endsAt < now) return "expired"
  return "active"
}

/**
 * Champ <input type="datetime-local"> saisi à l'heure de Tunis (UTC+1, sans
 * heure d'été depuis 2009) → instant UTC. Vide → null.
 */
export function parseTunisLocalDateTime(value: string): Date | null {
  const v = value.trim()
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("INVALID_DATE")
  const d = new Date(`${v}:00+01:00`)
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE")
  return d
}

/** Inverse de parseTunisLocalDateTime, pour pré-remplir le champ. */
export function toTunisLocalInput(d: Date | null): string {
  if (!d) return ""
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16)
}

export function validatePromotionInput(p: PromotionInput): void {
  if (!p.title || p.title.length > 200) throw new Error("INVALID_TITLE")
  if (!p.destination || p.destination.length > 120)
    throw new Error("INVALID_DESTINATION")
  if (!/^[a-z0-9-]{2,64}$/.test(p.moduleSlug)) throw new Error("INVALID_MODULE")
  if (!p.href.startsWith("/") || p.href.startsWith("//"))
    throw new Error("INVALID_HREF")
  if (!p.imageUrl) throw new Error("IMAGE_REQUIRED")
  if (p.flag && p.flag.length > 16) throw new Error("INVALID_FLAG")
  if (!Number.isInteger(p.sortOrder)) throw new Error("INVALID_SORT_ORDER")
  if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt)
    throw new Error("END_BEFORE_START")
}

/** Crée (id null) ou met à jour une promotion ; retourne son id. */
export async function savePromotionCore(
  tx: DrizzleTransaction,
  agencyId: string,
  id: string | null,
  input: PromotionInput,
): Promise<string> {
  validatePromotionInput(input)
  const values = { ...input, agencyId, updatedAt: new Date() }
  if (id) {
    const rows = await tx
      .update(publicPromotions)
      .set(values)
      .where(
        and(eq(publicPromotions.id, id), eq(publicPromotions.agencyId, agencyId)),
      )
      .returning({ id: publicPromotions.id })
    if (rows.length === 0) throw new Error("PROMOTION_NOT_SAVED")
    return rows[0].id
  }
  try {
    const [row] = await tx
      .insert(publicPromotions)
      .values(values)
      .returning({ id: publicPromotions.id })
    return row.id
  } catch (e) {
    // Index unique public_promotions_agency_destination_uniq.
    const cause = (e as { cause?: { code?: string } }).cause
    if (cause?.code === "23505") throw new Error("DESTINATION_ALREADY_USED")
    throw e
  }
}

export async function saveModuleVisualCore(
  tx: DrizzleTransaction,
  agencyId: string,
  input: {
    moduleSlug: string
    heroImageUrl: string | null
    enabled: boolean
    sortOrder: number
  },
): Promise<void> {
  if (!/^[a-z0-9-]{2,64}$/.test(input.moduleSlug))
    throw new Error("INVALID_MODULE")
  if (!Number.isInteger(input.sortOrder)) throw new Error("INVALID_SORT_ORDER")
  const rows = await tx
    .insert(publicModuleVisuals)
    .values({ agencyId, ...input })
    .onConflictDoUpdate({
      target: [publicModuleVisuals.agencyId, publicModuleVisuals.moduleSlug],
      set: {
        heroImageUrl: input.heroImageUrl,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      },
    })
    .returning({ id: publicModuleVisuals.id })
  if (rows.length === 0) throw new Error("MODULE_VISUAL_NOT_SAVED")
}

/** Toutes les promotions de l'agence (actives, programmées, expirées, désactivées). */
export function listAdminPromotionsCore(
  tx: DrizzleTransaction,
  agencyId: string,
) {
  return tx
    .select({
      id: publicPromotions.id,
      title: publicPromotions.title,
      subtitle: publicPromotions.subtitle,
      destination: publicPromotions.destination,
      moduleSlug: publicPromotions.moduleSlug,
      href: publicPromotions.href,
      imageUrl: publicPromotions.imageUrl,
      flag: publicPromotions.flag,
      enabled: publicPromotions.enabled,
      sortOrder: publicPromotions.sortOrder,
      startsAt: publicPromotions.startsAt,
      endsAt: publicPromotions.endsAt,
    })
    .from(publicPromotions)
    .where(eq(publicPromotions.agencyId, agencyId))
    .orderBy(asc(publicPromotions.sortOrder), asc(publicPromotions.createdAt))
}
