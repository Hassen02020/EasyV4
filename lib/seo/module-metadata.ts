import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

const BRAND = "Easy2Book"

export type ModuleMetadataNamespace =
  | "Hotels"
  | "HotelsMonde"
  | "Omra"
  | "Packages"
  | "Attractions"
  | "Vols"
  | "Transferts"
  | "Car"

export function withBrandSuffix(title: string): string {
  return title.includes(BRAND) ? title : `${title} | ${BRAND}`
}

/**
 * Métadonnées localisées d'une page catalogue de module : titre et description
 * = textes du hero déjà affichés sur la page (heroTitle / heroSubtitle).
 * Canonical auto-référente : chaque locale est une page équivalente à indexer
 * (hreflang réciproques), elle se déclare donc elle-même canonique.
 */
export async function buildModuleMetadata(
  namespace: ModuleMetadataNamespace,
  href: string,
): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations(namespace),
    getLocale(),
  ])
  const languages = buildLanguageAlternates(href)
  return {
    title: withBrandSuffix(t("heroTitle")),
    description: t("heroSubtitle"),
    alternates: { canonical: languages[locale], languages },
  }
}
