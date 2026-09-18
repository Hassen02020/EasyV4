/**
 * app/sitemap.ts — PHASE PREMIUM 2, Chantier 4 (Pages Destination + SEO).
 *
 * Aucun sitemap n'existait avant ce chantier (confirmé par l'audit
 * `docs/audits/destination-pages-seo-audit.md`). Couvre les pages statiques
 * du storefront public, les 28 fiches `/destinations/[slug]` (chantier 2/3)
 * et le catalogue produit déjà public (packages/attractions/omra) — mêmes
 * filtres `status='published'` + `channels` contient `'b2c'` + agence par
 * défaut que les pages de détail elles-mêmes (voir
 * `app/(public)/[locale]/packages/[slug]/page.tsx`, `attractions/[slug]`,
 * `omra/[id]`).
 *
 * Une entrée par chemin (pas par locale) avec `alternates.languages` —
 * next-intl expose ainsi les 3 variantes fr/en/ar sans tripler les URLs.
 */

import type { MetadataRoute } from "next"
import { and, arrayContains, eq } from "drizzle-orm"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { listActiveDestinationSlugs } from "@/lib/destinations/queries"
import { withPublicAgencyContext } from "@/lib/db/tenant-context"
import { catalogPackages, catalogActivities, omraPackages } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { siteOrigin } from "@/lib/mygo/config"

const STATIC_PATHS = [
  "/",
  "/omra",
  "/packages",
  "/hotels-monde",
  "/attractions",
  "/vols",
  "/car",
  "/transferts",
  "/panier",
  "/compte",
  "/mentions-legales",
  "/politique-confidentialite",
  "/cgv",
  "/destinations",
]

function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteOrigin()).toString()
}

function buildEntry(path: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  const languages = buildLanguageAlternates(path)
  const absoluteLanguages = Object.fromEntries(
    Object.entries(languages).map(([locale, pathname]) => [locale, absoluteUrl(pathname)]),
  )
  return {
    url: absoluteLanguages.fr ?? absoluteUrl(path),
    lastModified,
    alternates: { languages: absoluteLanguages },
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [destinationSlugs, agencyId] = await Promise.all([
    listActiveDestinationSlugs(),
    getDefaultAgencyId(),
  ])

  const staticEntries = STATIC_PATHS.map((path) => buildEntry(path))
  const destinationEntries = destinationSlugs.map((slug) => buildEntry(`/destinations/${slug}`))

  if (!agencyId) {
    return [...staticEntries, ...destinationEntries]
  }

  const [packages, activities, omra] = await withPublicAgencyContext(agencyId, async (tx) => {
    const pkgRows = await tx
      .select({ slug: catalogPackages.slug, updatedAt: catalogPackages.updatedAt })
      .from(catalogPackages)
      .where(
        and(
          eq(catalogPackages.agencyId, agencyId),
          eq(catalogPackages.status, "published"),
          arrayContains(catalogPackages.channels, ["b2c"]),
        ),
      )
    const actRows = await tx
      .select({ slug: catalogActivities.slug, updatedAt: catalogActivities.updatedAt })
      .from(catalogActivities)
      .where(
        and(
          eq(catalogActivities.agencyId, agencyId),
          eq(catalogActivities.status, "published"),
          arrayContains(catalogActivities.channels, ["b2c"]),
        ),
      )
    const omraRows = await tx
      .select({ id: omraPackages.id, updatedAt: omraPackages.updatedAt })
      .from(omraPackages)
      .where(
        and(
          eq(omraPackages.agencyId, agencyId),
          eq(omraPackages.status, "published"),
          arrayContains(omraPackages.channels, ["b2c"]),
        ),
      )
    return [pkgRows, actRows, omraRows]
  })

  const packageEntries = packages.map((p) => buildEntry(`/packages/${p.slug}`, p.updatedAt))
  const activityEntries = activities.map((a) => buildEntry(`/attractions/${a.slug}`, a.updatedAt))
  const omraEntries = omra.map((o) => buildEntry(`/omra/${o.id}`, o.updatedAt))

  return [...staticEntries, ...destinationEntries, ...packageEntries, ...activityEntries, ...omraEntries]
}
