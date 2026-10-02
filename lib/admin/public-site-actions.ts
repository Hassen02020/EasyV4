"use server"

import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { agencies, publicSiteSettings, publicModuleVisuals, publicPromotions } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import { withTenantContext } from "@/lib/db/tenant-context"

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
          contactEmail: optionalText(contactEmail, 320),
          contactPhone: optionalText(contactPhone, 32),
          address: optionalText(address, 2000),
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
  return { ok: true }
}

export async function savePublicModuleVisual(formData: FormData) {
  const ctx = await assertProductManager()
  const moduleSlug = clean(formData.get("moduleSlug"))
  const heroImageUrl = optionalUrl(clean(formData.get("heroImageUrl")))
  const enabled = clean(formData.get("enabled")) === "on"
  const sortOrder = Number.parseInt(clean(formData.get("sortOrder")) || "0", 10)

  if (!/^[a-z0-9-]{2,64}$/.test(moduleSlug)) throw new Error("INVALID_MODULE")
  if (!Number.isInteger(sortOrder)) throw new Error("INVALID_SORT_ORDER")

  await withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
    async (tx) => {
      await tx
        .insert(publicModuleVisuals)
        .values({
          agencyId: ctx.agencyId,
          moduleSlug,
          heroImageUrl,
          enabled,
          sortOrder,
        })
        .onConflictDoUpdate({
          target: [publicModuleVisuals.agencyId, publicModuleVisuals.moduleSlug],
          set: { heroImageUrl, enabled, sortOrder, updatedAt: new Date() },
        })
    },
  )

  revalidatePath("/[locale]", "layout")
  revalidatePath("/admin/site")
  return { ok: true }
}

export async function savePublicPromotion(formData: FormData) {
  const ctx = await assertProductManager()
  const id = clean(formData.get("id"))
  const title = clean(formData.get("title"))
  const subtitle = clean(formData.get("subtitle"))
  const destination = clean(formData.get("destination"))
  const moduleSlug = clean(formData.get("moduleSlug"))
  const href = clean(formData.get("href"))
  const imageUrl = optionalUrl(clean(formData.get("imageUrl")))
  const flag = clean(formData.get("flag"))
  const enabled = clean(formData.get("enabled")) === "on"
  const sortOrder = Number.parseInt(clean(formData.get("sortOrder")) || "0", 10)

  if (!title || title.length > 200) throw new Error("INVALID_TITLE")
  if (!destination || destination.length > 120) throw new Error("INVALID_DESTINATION")
  if (!/^[a-z0-9-]{2,64}$/.test(moduleSlug)) throw new Error("INVALID_MODULE")
  if (!href.startsWith("/")) throw new Error("INVALID_HREF")
  if (!imageUrl) throw new Error("IMAGE_REQUIRED")
  if (!Number.isInteger(sortOrder)) throw new Error("INVALID_SORT_ORDER")

  await withTenantContext(
    { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
    async (tx) => {
      const values = {
        agencyId: ctx.agencyId,
        title,
        subtitle: subtitle || null,
        destination,
        moduleSlug,
        href,
        imageUrl,
        flag: flag || null,
        enabled,
        sortOrder,
        updatedAt: new Date(),
      }

      if (id) {
        await tx
          .update(publicPromotions)
          .set(values)
          .where(
            and(
              eq(publicPromotions.id, id),
              eq(publicPromotions.agencyId, ctx.agencyId),
            ),
          )
      } else {
        await tx.insert(publicPromotions).values(values)
      }
    },
  )

  revalidatePath("/[locale]", "layout")
  revalidatePath("/admin/site")
  return { ok: true }
}
