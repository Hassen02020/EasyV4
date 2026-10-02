"use client"

/**
 * Cross-sell produit sur une fiche destination ville — Phase Premium 2,
 * chantier 5. Données déjà résolues côté serveur (`lib/destinations/cross-sell.ts`)
 * — ce composant ne fait que l'affichage, formaté avec la devise active
 * (`useCurrency`, même mécanisme que `PackageList`/`attractions`).
 */

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/components/currency-context"
import { Clock, Compass, Package as PackageIcon } from "lucide-react"
import type {
  CrossSellPackage,
  CrossSellActivity,
} from "@/lib/destinations/cross-sell"

interface Props {
  cityName: string
  packages: CrossSellPackage[]
  activities: CrossSellActivity[]
}

export function DestinationCrossSell({
  cityName,
  packages,
  activities,
}: Props) {
  const t = useTranslations("Destinations")
  const { format: formatPrice } = useCurrency()

  if (packages.length === 0 && activities.length === 0) return null

  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="mb-4 text-lg font-semibold">
        {t("crossSellTitle", { city: cityName })}
      </h2>
      <div className="space-y-6">
        {packages.length > 0 && (
          <div>
            <h3 className="text-muted-foreground mb-3 text-sm font-medium">
              {t("crossSellPackagesHeading")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {packages.map((pkg) => (
                <Link
                  key={pkg.id}
                  href={`/packages/${pkg.slug}`}
                  className="bg-background flex gap-3 rounded-lg border p-3 transition-colors hover:border-violet-300"
                >
                  <div className="bg-muted relative h-16 w-20 shrink-0 overflow-hidden rounded-md">
                    {pkg.coverUrl ? (
                      <Image
                        src={pkg.coverUrl}
                        alt={pkg.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-800 to-violet-600">
                        <PackageIcon className="h-5 w-5 text-white/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pkg.title}</p>
                    {pkg.durationDays && (
                      <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {t("crossSellDurationDays", { days: pkg.durationDays })}
                      </p>
                    )}
                    {pkg.priceFromTnd != null && (
                      <p className="mt-1 text-sm font-semibold text-violet-700">
                        {formatPrice(pkg.priceFromTnd)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {activities.length > 0 && (
          <div>
            <h3 className="text-muted-foreground mb-3 text-sm font-medium">
              {t("crossSellActivitiesHeading")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {activities.map((activity) => (
                <Link
                  key={activity.id}
                  href={`/attractions/${activity.slug}`}
                  className="bg-background flex gap-3 rounded-lg border p-3 transition-colors hover:border-violet-300"
                >
                  <div className="bg-muted relative h-16 w-20 shrink-0 overflow-hidden rounded-md">
                    {activity.coverUrl ? (
                      <Image
                        src={activity.coverUrl}
                        alt={activity.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-800 to-violet-600">
                        <Compass className="h-5 w-5 text-white/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {activity.title}
                    </p>
                    {activity.durationMinutes && (
                      <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {t("crossSellDurationMinutes", {
                          minutes: activity.durationMinutes,
                        })}
                      </p>
                    )}
                    {activity.priceFromTnd != null && (
                      <p className="mt-1 text-sm font-semibold text-violet-700">
                        {formatPrice(activity.priceFromTnd)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
