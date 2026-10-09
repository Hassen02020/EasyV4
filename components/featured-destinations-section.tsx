import { MapPin, ArrowRight } from "lucide-react"
import { getTranslations, getLocale } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import {
  getFeaturedDestinations,
  getExternalRefsForDestinations,
} from "@/lib/destinations/featured-destinations-queries"
import {
  type DestinationModule,
  destinationLinkHref,
  localizedDestinationName,
} from "@/lib/destinations/queries"
import type { Locale } from "@/lib/locale"

const BOOKING_MODULE_PRIORITY: DestinationModule[] = [
  "hotels_monde_slug",
  "packages_slug",
  "iata",
]

function primaryBookingHref(
  refs: { module: string; externalId: string }[],
): string | null {
  for (const mod of BOOKING_MODULE_PRIORITY) {
    const ref = refs.find((r) => r.module === mod)
    if (ref) return destinationLinkHref(mod, ref.externalId)
  }
  return null
}

export async function FeaturedDestinationsSection() {
  const [featuredDests, t, rawLocale] = await Promise.all([
    Promise.race([
      getFeaturedDestinations().catch(() => []),
      new Promise<never[]>((r) => setTimeout(() => r([]), 1000)),
    ]),
    getTranslations("FeaturedDestinations"),
    getLocale(),
  ])

  if (featuredDests.length === 0) return null

  const locale = rawLocale as Locale

  const refs = await Promise.race([
    getExternalRefsForDestinations(featuredDests.map((d) => d.id)).catch(
      () => [],
    ),
    new Promise<never[]>((r) => setTimeout(() => r([]), 1000)),
  ])

  // Map: destinationId → active external refs
  const refsByDest = new Map<string, { module: string; externalId: string }[]>()
  for (const ref of refs) {
    const list = refsByDest.get(ref.destinationId) ?? []
    list.push({ module: ref.module, externalId: ref.externalId })
    refsByDest.set(ref.destinationId, list)
  }

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex items-center gap-3">
          <MapPin className="h-6 w-6 text-rose-500" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t("heading")}
          </h2>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredDests.map((dest) => {
            const destRefs = refsByDest.get(dest.id) ?? []
            const bookingHref = primaryBookingHref(destRefs)
            const displayName = localizedDestinationName(dest, locale)

            return (
              <li
                key={dest.id}
                className="group border-border bg-card relative flex flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Cover image or gradient placeholder */}
                <div className="relative h-40 w-full bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-900/30 dark:to-rose-800/30">
                  {dest.coverMediaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dest.coverMediaUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="text-foreground font-semibold">{displayName}</p>

                  {dest.region && (
                    <p className="text-muted-foreground text-xs">
                      {dest.region}
                    </p>
                  )}

                  <div className="mt-auto pt-2">
                    {bookingHref ? (
                      /* CTA réservation — uniquement si external_ref actif (R9-04) */
                      <Link
                        href={bookingHref}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-600"
                      >
                        {t("cta")}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {t("comingSoon")}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
