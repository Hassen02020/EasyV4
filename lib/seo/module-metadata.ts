import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
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
 */
export async function buildModuleMetadata(
  namespace: ModuleMetadataNamespace,
  href: string,
): Promise<Metadata> {
  const t = await getTranslations(namespace)
  return {
    title: withBrandSuffix(t("heroTitle")),
    description: t("heroSubtitle"),
    alternates: { languages: buildLanguageAlternates(href) },
  }
}
