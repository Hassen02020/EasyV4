/**
 * Index des destinations — /destinations
 *
 * PHASE PREMIUM 2 — Chantier 4 (Pages Destination + SEO). Liste les pays et
 * villes actifs du Canonical Destination Model (chantier 2/3), lus via
 * `withSystemContext()` — même mécanisme que le reste du catalogue public.
 */

import { Link } from "@/i18n/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { MapPin } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { listActiveCountriesWithCities, localizedDestinationName } from "@/lib/destinations/queries"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import type { Locale } from "@/lib/locale"

export async function generateMetadata() {
  const t = await getTranslations("Destinations")
  return {
    title: `${t("indexTitle")} | Easy2Book`,
    description: t("indexDescription"),
    alternates: { languages: buildLanguageAlternates("/destinations") },
  }
}

export default async function DestinationsIndexPage() {
  const [countries, t, locale] = await Promise.all([
    listActiveCountriesWithCities(),
    getTranslations("Destinations"),
    getLocale(),
  ])
  const loc = locale as Locale

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <h1 className="mb-2 text-2xl font-bold md:text-3xl">{t("indexTitle")}</h1>
          <p className="mb-8 text-sm text-muted-foreground">{t("indexDescription")}</p>

          <div className="space-y-8">
            {countries.map((country) => (
              <section key={country.id} className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <MapPin className="h-4.5 w-4.5 text-violet-700" />
                  <Link href={`/destinations/${country.slug}`} className="hover:underline">
                    {localizedDestinationName(country, loc)}
                  </Link>
                </h2>
                {country.cities.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {country.cities.map((city) => (
                      <li key={city.id}>
                        <Link
                          href={`/destinations/${city.slug}`}
                          className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-violet-300 hover:text-violet-700"
                        >
                          {localizedDestinationName(city, loc)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
