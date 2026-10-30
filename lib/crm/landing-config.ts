/**
 * CRM-LANDING-01 — landing pages de campagne, une par type de prospect
 * accepté en base (contrainte `leads_product_type_check` : hotel, omra,
 * package, activity, general — aucune migration).
 *
 * URL : /{locale}/landing/{slug}?utm_campaign=… (ou ?campaign=…). Le
 * formulaire est sur la page d'arrivée elle-même : la campagne de l'URL est
 * lue directement, sans dépendre du stockage du navigateur.
 *
 * Contenu uniquement factuel (textes i18n `Landing`) : aucun prix, aucune
 * offre, aucune promesse inventée ; le lien « voir les offres » renvoie vers
 * le catalogue réel du module.
 */
import type { LeadProductType } from "@/lib/crm/leads-core"

export interface LandingConfig {
  slug: string
  productType: LeadProductType
  /** Préfixe des clés i18n `Landing.<key>Title` / `<key>Subtitle`. */
  i18nKey: "hotel" | "omra" | "package" | "activity" | "general"
  /** Catalogue réel du module (lien « voir les offres »). */
  listingHref: string
  gradient: string
}

export const LANDING_PAGES: readonly LandingConfig[] = [
  {
    slug: "hotels",
    productType: "hotel",
    i18nKey: "hotel",
    listingHref: "/hotels",
    gradient: "from-sky-900 to-sky-700",
  },
  {
    slug: "omra",
    productType: "omra",
    i18nKey: "omra",
    listingHref: "/omra",
    gradient: "from-emerald-900 to-emerald-700",
  },
  {
    slug: "voyages",
    productType: "package",
    i18nKey: "package",
    listingHref: "/packages",
    gradient: "from-indigo-900 to-indigo-700",
  },
  {
    slug: "activites",
    productType: "activity",
    i18nKey: "activity",
    listingHref: "/activities",
    gradient: "from-amber-900 to-amber-700",
  },
  {
    slug: "voyage",
    productType: "general",
    i18nKey: "general",
    listingHref: "/",
    gradient: "from-zinc-900 to-zinc-700",
  },
] as const

/** Configuration d'une landing, ou null si le slug est inconnu (→ 404). */
export function findLandingConfig(slug: string): LandingConfig | null {
  return LANDING_PAGES.find((l) => l.slug === slug) ?? null
}
