"use client"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/components/locale-context"

/**
 * Destinations d'inspiration — aucun prix/date n'est affiché ici : ces
 * chiffres n'existent nulle part côté serveur pour ces cartes (contrairement
 * aux pages de résultats /hotels-monde, /hotels/search, /omra qui, elles,
 * interrogent le catalogue réel). Chaque carte pointe vers la vraie page de
 * recherche du module correspondant plutôt que d'inventer un tarif.
 */
const offers = [
  {
    id: 1,
    destination: "Istanbul",
    type: "Vols + Hôtel",
    href: "/hotels-monde",
    image:
      "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&h=400&fit=crop",
    flag: "🇹🇷",
  },
  {
    id: 2,
    destination: "Djerba",
    type: "Tout Inclus",
    href: "/hotels/search",
    image:
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop",
    flag: "🇹🇳",
  },
  {
    id: 3,
    destination: "Omra",
    type: "Programme Éco",
    href: "/omra",
    image:
      "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=600&h=400&fit=crop",
    flag: "🇸🇦",
  },
]

export function FlashOffers() {
  const t = useT()
  return (
    <section className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-foreground mb-8 text-2xl font-bold sm:text-3xl">
          {t("meilleurOffres")}
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-card border-border overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-lg"
            >
              {/* Image Container */}
              <div className="relative h-48 sm:h-56">
                <Image
                  src={offer.image}
                  alt={offer.destination}
                  fill
                  className="object-cover"
                />
                <Badge
                  variant="secondary"
                  className="bg-sidebar text-sidebar-foreground absolute top-3 left-3 font-medium"
                >
                  {t("flashOffers")}
                </Badge>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-foreground flex items-center gap-2 text-lg font-bold">
                      {offer.destination}
                      <span className="text-base">{offer.flag}</span>
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {offer.type}
                    </p>
                  </div>
                </div>

                <div className="border-border flex items-center justify-end border-t pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    asChild
                  >
                    <Link href={offer.href}>{t("reserverMaintenant")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
