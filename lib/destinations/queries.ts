/**
 * Helpers de lecture — Phase Premium 2, Chantier 4 (Pages Destination + SEO).
 *
 * Toutes les fonctions lisent via `withPublicAgencyContext(null, ...)`
 * (catalogue géo public, même mécanisme que
 * `app/api/destinations/search/route.ts`, chantier 3) et filtrent
 * systématiquement `isActive`. Aucune de ces fonctions ne touche au moteur
 * Wallet/Settlement ni à aucune table réservation.
 */

import { and, eq, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { destinations, destinationExternalRefs, type Destination } from "@/lib/db/schema"
import { withPublicAgencyContext } from "@/lib/db/tenant-context"
import type { Locale } from "@/lib/locale"

export type DestinationModule = "hotels_monde_slug" | "packages_slug" | "iata"

const MODULE_SEARCH_PATH: Record<DestinationModule, string> = {
  hotels_monde_slug: "/hotels-monde",
  packages_slug: "/packages",
  iata: "/vols",
}

/** Construit le lien de recherche pré-rempli d'un module (`?destination=<external_id>`). */
export function destinationLinkHref(module: DestinationModule, externalId: string): string {
  return `${MODULE_SEARCH_PATH[module]}?destination=${encodeURIComponent(externalId)}`
}

/** Nom localisé avec repli sur le français (name) si name_en/name_ar absent. */
export function localizedDestinationName(
  dest: Pick<Destination, "name" | "nameEn" | "nameAr">,
  locale: Locale,
): string {
  if (locale === "en") return dest.nameEn ?? dest.name
  if (locale === "ar") return dest.nameAr ?? dest.name
  return dest.name
}

/** Tous les slugs actifs (pays + villes) — pour `generateStaticParams()`. */
export async function listActiveDestinationSlugs(): Promise<string[]> {
  const rows = await withPublicAgencyContext(null, (tx) =>
    tx.select({ slug: destinations.slug }).from(destinations).where(eq(destinations.isActive, true)),
  )
  return rows.map((r) => r.slug)
}

export interface CountryWithCities extends Destination {
  cities: Destination[]
}

/** Pays actifs avec leurs villes actives — pour l'index `/destinations`. */
export async function listActiveCountriesWithCities(): Promise<CountryWithCities[]> {
  const countries = await withPublicAgencyContext(null, (tx) =>
    tx
      .select()
      .from(destinations)
      .where(and(eq(destinations.type, "country"), eq(destinations.isActive, true), isNull(destinations.parentId)))
      .orderBy(destinations.name),
  )

  const cities = await withPublicAgencyContext(null, (tx) =>
    tx
      .select()
      .from(destinations)
      .where(and(eq(destinations.type, "city"), eq(destinations.isActive, true)))
      .orderBy(destinations.name),
  )

  return countries.map((country) => ({
    ...country,
    cities: cities.filter((city) => city.parentId === country.id),
  }))
}

export interface DestinationDetail {
  destination: Destination
  /** Renseigné uniquement pour une fiche ville. */
  parent: Destination | null
  /** Renseigné uniquement pour une fiche pays. */
  children: Destination[]
  /** Renseigné uniquement pour une fiche ville — liens sortants vers les modules rattachés. */
  externalRefs: { module: DestinationModule; externalId: string }[]
}

const KNOWN_MODULES = new Set<string>(["hotels_monde_slug", "packages_slug", "iata"])

/** Fiche destination complète (pays ou ville) par slug — `null` si absente/inactive. */
export async function getDestinationBySlug(slug: string): Promise<DestinationDetail | null> {
  const parentAlias = alias(destinations, "parent")

  const [row] = await withPublicAgencyContext(null, (tx) =>
    tx
      .select({ destination: destinations, parent: parentAlias })
      .from(destinations)
      .leftJoin(parentAlias, eq(destinations.parentId, parentAlias.id))
      .where(and(eq(destinations.slug, slug), eq(destinations.isActive, true)))
      .limit(1),
  )
  if (!row) return null

  const { destination } = row
  const parent = row.parent ?? null

  const children =
    destination.type === "country"
      ? await withPublicAgencyContext(null, (tx) =>
          tx
            .select()
            .from(destinations)
            .where(
              and(
                eq(destinations.parentId, destination.id),
                eq(destinations.type, "city"),
                eq(destinations.isActive, true),
              ),
            )
            .orderBy(destinations.name),
        )
      : []

  const externalRefsRaw =
    destination.type === "city"
      ? await withPublicAgencyContext(null, (tx) =>
          tx
            .select({
              module: destinationExternalRefs.module,
              externalId: destinationExternalRefs.externalId,
            })
            .from(destinationExternalRefs)
            .where(
              and(
                eq(destinationExternalRefs.destinationId, destination.id),
                eq(destinationExternalRefs.isActive, true),
              ),
            ),
        )
      : []

  const externalRefs = externalRefsRaw.filter(
    (ref): ref is { module: DestinationModule; externalId: string } => KNOWN_MODULES.has(ref.module),
  )

  return { destination, parent, children, externalRefs }
}
