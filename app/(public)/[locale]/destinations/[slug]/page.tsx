/**
 * Fiche destination — /destinations/[slug]
 *
 * PHASE PREMIUM 2 — Chantier 4 (Pages Destination + SEO). Une fiche par
 * ligne active de `destinations` (pays ou ville, chantier 2/3) :
 *   - fiche ville : fil d'Ariane vers le pays, description, liens sortants
 *     vers les recherches pré-remplies des modules rattachés
 *     (`destination_external_refs` — hôtels_monde/packages/vols).
 *   - fiche pays : fil d'Ariane, description, liste des villes enfants.
 *
 * `seoDescription` (backfill migration 0056) n'a pas de variante par locale
 * (une seule colonne texte, français) — affichée uniquement en `fr` ; les
 * locales `en`/`ar` utilisent un gabarit générique traduit
 * (`Destinations.genericDescriptionCity/Country`), jamais ce texte français.
 *
 * JSON-LD `schema.org/Place` : nom + description réels uniquement, aucun
 * `geo` (latitude/longitude jamais renseignées en base — pas de coordonnées
 * inventées).
 */

import { cache } from "react"
import { Link } from "@/i18n/navigation"
import { notFound } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { ArrowLeft, ArrowRight, Hotel, MapPin, Package, Plane } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import {
  destinationLinkHref,
  getDestinationBySlug,
  listActiveDestinationSlugs,
  localizedDestinationName,
  type DestinationModule,
} from "@/lib/destinations/queries"
import { getCrossSellPackages, getCrossSellActivities } from "@/lib/destinations/cross-sell"
import { DestinationCrossSell } from "@/components/destinations/destination-cross-sell"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import type { Locale } from "@/lib/locale"

const getDestination = cache(getDestinationBySlug)

export async function generateStaticParams() {
  // DB injoignable pendant le build (ex. build sans accès réseau au pooler
  // Supabase) : ne doit jamais faire échouer `next build` entier. En
  // renvoyant [] ici, aucune fiche destination n'est pré-générée au build,
  // mais `dynamicParams` reste à son défaut Next.js (true, non modifié
  // ailleurs dans ce fichier) — chaque /destinations/[slug] est alors
  // simplement rendue à la demande au premier accès, comportement runtime
  // utilisateur final inchangé une fois la DB accessible.
  try {
    const slugs = await listActiveDestinationSlugs()
    return slugs.map((slug) => ({ slug }))
  } catch {
    return []
  }
}

const MODULE_ICON: Record<DestinationModule, typeof Hotel> = {
  hotels_monde_slug: Hotel,
  packages_slug: Package,
  iata: Plane,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await getDestination(slug)
  if (!detail) return {}
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("Destinations")
  const { destination, parent } = detail
  const name = localizedDestinationName(destination, locale)
  const countryName = parent ? localizedDestinationName(parent, locale) : null

  const description =
    locale === "fr" && destination.seoDescription
      ? destination.seoDescription
      : destination.type === "city"
        ? t("genericDescriptionCity", { city: name, country: countryName ?? "" })
        : t("genericDescriptionCountry", { country: name })

  return {
    title: `${name} — Destinations | Easy2Book`,
    description,
    alternates: {
      languages: buildLanguageAlternates(`/destinations/${destination.slug}`),
      canonical: `/destinations/${destination.slug}`,
    },
    openGraph: {
      title: name,
      description,
      type: "website",
      url: `/destinations/${destination.slug}`,
      images: destination.coverMediaUrl ? [{ url: destination.coverMediaUrl }] : undefined,
    },
  }
}

export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await getDestination(slug)
  if (!detail) notFound()
  const { destination, parent, children, externalRefs } = detail

  const locale = (await getLocale()) as Locale
  const t = await getTranslations("Destinations")
  const name = localizedDestinationName(destination, locale)
  const countryName = parent ? localizedDestinationName(parent, locale) : null

  // Cross-sell (chantier 5) : fiches ville uniquement — les deux relations
  // sont réelles (voir lib/destinations/cross-sell.ts), jamais fabriquées.
  const [crossSellPackages, crossSellActivities] =
    destination.type === "city"
      ? await Promise.all([getCrossSellPackages(destination.slug), getCrossSellActivities(destination.name)])
      : [[], []]

  const description =
    locale === "fr" && destination.seoDescription
      ? destination.seoDescription
      : destination.type === "city"
        ? t("genericDescriptionCity", { city: name, country: countryName ?? "" })
        : t("genericDescriptionCountry", { country: name })

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name,
    description,
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <div className="relative flex h-52 w-full items-center justify-center bg-gradient-to-br from-violet-900 to-violet-700 md:h-64">
          <MapPin className="h-14 w-14 text-white/25" />
          <span className="sr-only">{t("noCover")}</span>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
            <div className="mx-auto max-w-4xl">
              <nav className="mb-2 flex items-center gap-1.5 text-xs text-white/80">
                <Link href="/destinations" className="inline-flex items-center gap-1 hover:text-white">
                  <ArrowLeft className="h-3 w-3" />
                  {t("backToDestinations")}
                </Link>
                {parent && (
                  <>
                    <span>/</span>
                    <Link href={`/destinations/${parent.slug}`} className="hover:text-white">
                      {localizedDestinationName(parent, locale)}
                    </Link>
                  </>
                )}
              </nav>
              <h1 className="text-2xl font-bold text-white md:text-3xl">{name}</h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <section className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{description}</p>
          </section>

          {destination.type === "city" && externalRefs.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-lg font-semibold">{t("bookTitle")}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {externalRefs.map((ref) => {
                  const Icon = MODULE_ICON[ref.module]
                  return (
                    <Link
                      key={ref.module}
                      href={destinationLinkHref(ref.module, ref.externalId)}
                      className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-violet-300 hover:text-violet-700"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {ref.module === "hotels_monde_slug" && t("hotelsMondeCta", { city: name })}
                      {ref.module === "packages_slug" && t("packagesCta", { city: name })}
                      {ref.module === "iata" && t("volsCta", { city: name })}
                      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          {destination.type === "city" && (
            <DestinationCrossSell
              cityName={name}
              packages={crossSellPackages}
              activities={crossSellActivities}
            />
          )}

          {destination.type === "country" && children.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-lg font-semibold">{t("citiesInCountry")}</h2>
              <ul className="flex flex-wrap gap-2">
                {children.map((city) => (
                  <li key={city.id}>
                    <Link
                      href={`/destinations/${city.slug}`}
                      className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-violet-300 hover:text-violet-700"
                    >
                      {localizedDestinationName(city, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
