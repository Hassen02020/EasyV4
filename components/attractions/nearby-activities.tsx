"use client"

/**
 * Puzzle / Related Products — audit "Puzzle / Related Products" (GO A) :
 * réutilise `getCrossSellActivities()` (lib/destinations/cross-sell.ts,
 * déjà réel, déjà en production sur la fiche destination) plutôt que de
 * créer un nouveau moteur de recommandation. Seule nouveauté : ce point
 * d'appel sur la fiche PRODUIT (activité) elle-même, qui n'existait nulle
 * part avant ce chantier — la fiche destination reste inchangée.
 */

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/components/currency-context"
import { Clock, Compass } from "lucide-react"
import type { CrossSellActivity } from "@/lib/destinations/cross-sell"

export function NearbyActivities({
  activities,
}: {
  activities: CrossSellActivity[]
}) {
  const t = useTranslations("Attractions")
  const { format: formatPrice } = useCurrency()

  if (activities.length === 0) return null

  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="mb-4 text-lg font-semibold">
        {t("nearbyActivitiesTitle")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {activities.map((activity) => (
          <Link
            key={activity.id}
            href={`/attractions/${activity.slug}`}
            className="bg-background flex gap-3 rounded-lg border p-3 transition-colors hover:border-teal-300"
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
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-800 to-teal-600">
                  <Compass className="h-5 w-5 text-white/50" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{activity.title}</p>
              {activity.durationMinutes && (
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  {t("durationMinutes", { minutes: activity.durationMinutes })}
                </p>
              )}
              {activity.priceFromTnd != null && (
                <p className="mt-1 text-sm font-semibold text-teal-700">
                  {formatPrice(activity.priceFromTnd)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
