import "server-only"

import { and, asc, eq, lte, or, isNull, gte } from "drizzle-orm"
import {
  agencies,
  publicSiteSettings,
  publicModuleVisuals,
  publicPromotions,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withSystemContext } from "@/lib/db/tenant-context"

export interface PublicSiteConfig {
  brandName: string
  logoUrl: string | null
  contactEmail: string | null
  contactPhone: string | null
  address: string | null
  heroImageUrl: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  tiktokUrl: string | null
}

export async function getPublicSiteConfig(): Promise<PublicSiteConfig | null> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null

  try {
    return await withSystemContext(async (db) => {
      const [row] = await db
        .select({
          brandName: agencies.brandName,
          agencyName: agencies.name,
          logoUrl: agencies.logoUrl,
          contactEmail: agencies.contactEmail,
          contactPhone: agencies.contactPhone,
          address: agencies.address,
          heroImageUrl: publicSiteSettings.heroImageUrl,
          facebookUrl: publicSiteSettings.facebookUrl,
          instagramUrl: publicSiteSettings.instagramUrl,
          tiktokUrl: publicSiteSettings.tiktokUrl,
        })
        .from(agencies)
        .leftJoin(
          publicSiteSettings,
          eq(publicSiteSettings.agencyId, agencies.id),
        )
        .where(eq(agencies.id, agencyId))
        .limit(1)

      if (!row) return null

      return {
        brandName: row.brandName ?? row.agencyName,
        logoUrl: row.logoUrl,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        address: row.address,
        heroImageUrl: row.heroImageUrl,
        facebookUrl: row.facebookUrl,
        instagramUrl: row.instagramUrl,
        tiktokUrl: row.tiktokUrl,
      }
    })
  } catch {
    return null
  }
}

export async function getPublicModuleVisuals() {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return []

  try {
    return await withSystemContext(async (db) =>
      db
        .select({
          moduleSlug: publicModuleVisuals.moduleSlug,
          enabled: publicModuleVisuals.enabled,
          sortOrder: publicModuleVisuals.sortOrder,
          heroImageUrl: publicModuleVisuals.heroImageUrl,
        })
        .from(publicModuleVisuals)
        .where(eq(publicModuleVisuals.agencyId, agencyId))
        .orderBy(asc(publicModuleVisuals.sortOrder), asc(publicModuleVisuals.moduleSlug)),
    )
  } catch {
    return []
  }
}

export async function getPublicModuleVisual(
  moduleSlug: string,
): Promise<{ heroImageUrl: string | null } | null> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null

  try {
    return await withSystemContext(async (db) => {
      const [row] = await db
        .select({ heroImageUrl: publicModuleVisuals.heroImageUrl })
        .from(publicModuleVisuals)
        .where(
          and(
            eq(publicModuleVisuals.agencyId, agencyId),
            eq(publicModuleVisuals.moduleSlug, moduleSlug),
            eq(publicModuleVisuals.enabled, true),
          ),
        )
        .limit(1)
      return row ?? null
    })
  } catch {
    return null
  }
}

export async function getPublicPromotions() {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return []

  const now = new Date()

  try {
    return await withSystemContext(async (db) =>
      db
        .select({
          id: publicPromotions.id,
          title: publicPromotions.title,
          subtitle: publicPromotions.subtitle,
          destination: publicPromotions.destination,
          moduleSlug: publicPromotions.moduleSlug,
          href: publicPromotions.href,
          image: publicPromotions.imageUrl,
          flag: publicPromotions.flag,
        })
        .from(publicPromotions)
        .where(
          and(
            eq(publicPromotions.agencyId, agencyId),
            eq(publicPromotions.enabled, true),
            or(isNull(publicPromotions.startsAt), lte(publicPromotions.startsAt, now)),
            or(isNull(publicPromotions.endsAt), gte(publicPromotions.endsAt, now)),
          ),
        )
        .orderBy(asc(publicPromotions.sortOrder), asc(publicPromotions.createdAt))
        .limit(6),
    )
  } catch {
    return []
  }
}
