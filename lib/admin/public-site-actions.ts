"use server"

import { randomUUID } from "crypto"
import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import {
  agencies,
  publicSiteSettings,
  publicModuleVisuals,
  publicPromotions,
} from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getMediaStorage } from "@/lib/media/storage"
import { MediaValidationError } from "@/lib/media/optimize"
import {
  parseTunisLocalDateTime,
  saveModuleVisualCore,
  savePromotionCore,
} from "@/lib/public/site-admin-core"
import {
  SITE_IMAGE_ERROR_MESSAGES,
  isSiteImageSlot,
  prepareSiteImage,
  siteImageKey,
} from "@/lib/media/site-image"

function clean(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : ""
}

function optionalUrl(value: string): string | null {
  if (!value) return null
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("INVALID_URL")
  }
  return url.toString()
}

function optionalText(value: string, max: number): string | null {
  const v = value.trim()
  if (!v) return null
  if (v.length > max) throw new Error("VALUE_TOO_LONG")
  return v
}

export async function savePublicSiteSettings(formData: FormData) {
  const ctx = await assertProductManager()
  const logoUrl = optionalUrl(clean(formData.get("logoUrl")))
  const heroImageUrl = optionalUrl(clean(formData.get("heroImageUrl")))
  const facebookUrl = optionalUrl(clean(formData.get("facebookUrl")))
  const instagramUrl = optionalUrl(clean(formData.get("instagramUrl")))
  const tiktokUrl = optionalUrl(clean(formData.get("tiktokUrl")))
  const contactEmail = clean(formData.get("contactEmail"))
  const contactPhone = clean(formData.get("contactPhone"))
  const address = clean(formData.get("address"))

  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    throw new Error("INVALID_EMAIL")
  }

  await withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
    async (tx) => {
      await tx
        .update(agencies)
        .set({
          logoUrl,
          contactEmail: optionalText(contactEmail, 320),
          contactPhone: optionalText(contactPhone, 32),
          address: optionalText(address, 2000),
          // Réseaux aussi sur l'agence : lus par la signature email et le
          // footer (getSiteContactInfo) — une seule saisie, deux lecteurs.
          facebookUrl,
          instagramUrl,
          tiktokUrl,
          updatedAt: new Date(),
        })
        .where(eq(agencies.id, ctx.agencyId))

      const [existing] = await tx
        .select({ id: publicSiteSettings.id })
        .from(publicSiteSettings)
        .where(eq(publicSiteSettings.agencyId, ctx.agencyId))
        .limit(1)

      if (existing) {
        await tx
          .update(publicSiteSettings)
          .set({
            heroImageUrl,
            facebookUrl,
            instagramUrl,
            tiktokUrl,
            updatedAt: new Date(),
          })
          .where(eq(publicSiteSettings.id, existing.id))
      } else {
        await tx.insert(publicSiteSettings).values({
          agencyId: ctx.agencyId,
          heroImageUrl,
          facebookUrl,
          instagramUrl,
          tiktokUrl,
        })
      }
    },
  )

  revalidatePath("/[locale]", "layout")
  revalidatePath("/admin/site")
}

/**
 * SITE-PROMO-BANNERS-01 — la RLS réserve l'écriture des visuels de modules et
 * des promotions au super admin (drizzle/manual/0119) : rôle vérifié ici,
 * puis contexte super admin réel. Avant, isSuperAdmin: false → rien ne
 * s'enregistrait (voir lib/public/site-admin-core.ts).
 */
async function assertSiteContentAdmin() {
  const ctx = await assertProductManager()
  if (ctx.role !== "super_admin") throw new Error("FORBIDDEN_SUPER_ADMIN_ONLY")
  return ctx
}

export async function savePublicModuleVisual(formData: FormData) {
  const ctx = await assertSiteContentAdmin()
  const input = {
    moduleSlug: clean(formData.get("moduleSlug")),
    heroImageUrl: optionalUrl(clean(formData.get("heroImageUrl"))),
    enabled: clean(formData.get("enabled")) === "on",
    sortOrder: Number.parseInt(clean(formData.get("sortOrder")) || "0", 10),
  }

  await withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: true },
    (tx) => saveModuleVisualCore(tx, ctx.agencyId, input),
  )

  revalidatePath("/[locale]", "layout")
  revalidatePath("/admin/site")
}

export async function savePublicPromotion(formData: FormData) {
  const ctx = await assertSiteContentAdmin()
  const id = clean(formData.get("id")) || null
  const input = {
    title: clean(formData.get("title")),
    subtitle: clean(formData.get("subtitle")) || null,
    destination: clean(formData.get("destination")),
    moduleSlug: clean(formData.get("moduleSlug")),
    href: clean(formData.get("href")),
    imageUrl: optionalUrl(clean(formData.get("imageUrl"))) ?? "",
    flag: clean(formData.get("flag")) || null,
    enabled: clean(formData.get("enabled")) === "on",
    sortOrder: Number.parseInt(clean(formData.get("sortOrder")) || "0", 10),
    startsAt: parseTunisLocalDateTime(clean(formData.get("startsAt"))),
    endsAt: parseTunisLocalDateTime(clean(formData.get("endsAt"))),
  }

  await withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: true },
    (tx) => savePromotionCore(tx, ctx.agencyId, id, input),
  )

  revalidatePath("/[locale]", "layout")
  revalidatePath("/admin/site")
}

export type UploadSiteImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * SITE-MEDIA-UPLOAD-01 — envoi d'une image du site public (logo, Hero,
 * visuel de module, promotion). Retourne l'URL publique ; elle est ensuite
 * enregistrée par le formulaire existant (bouton « Enregistrer »).
 * `formData` attend : `slot`, `file`.
 */
export async function uploadSiteImage(
  formData: FormData,
): Promise<UploadSiteImageResult> {
  let ctx
  try {
    ctx = await assertProductManager()
  } catch {
    return { ok: false, error: "Accès refusé." }
  }

  const slot = String(formData.get("slot") ?? "")
  const file = formData.get("file")
  if (!isSiteImageSlot(slot))
    return { ok: false, error: "Emplacement invalide." }
  if (!(file instanceof File)) return { ok: false, error: "Fichier manquant." }

  let prepared
  try {
    prepared = await prepareSiteImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      slot,
    )
  } catch (e) {
    if (e instanceof MediaValidationError) {
      return {
        ok: false,
        error: SITE_IMAGE_ERROR_MESSAGES[e.code] ?? "Image refusée.",
      }
    }
    return { ok: false, error: "Image illisible." }
  }

  const key = siteImageKey(ctx.agencyId, slot, randomUUID(), prepared.ext)
  try {
    const storage = getMediaStorage()
    await storage.put(key, prepared.buffer, prepared.contentType)
    return { ok: true, url: storage.getPublicUrl(key) }
  } catch {
    return { ok: false, error: "Échec de l'envoi vers le stockage." }
  }
}
