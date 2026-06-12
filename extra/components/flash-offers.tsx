"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLanguageCurrency } from "@/lib/i18n/LanguageCurrencyContext"

const offers = [
  {
    id: 1,
    destination: "Istanbul",
    type: "Vols + Hôtel",
    date: "15 Nov - 2026",
    price: "1450",
    currency: "TND",
    priceUnit: "",
    image:
      "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&h=400&fit=crop",
    flag: "🇹🇷",
  },
  {
    id: 2,
    destination: "Djerba",
    type: "Tout Inclus",
    priceNote: "180 TND / nuit",
    price: "180",
    currency: "TND",
    priceUnit: "/ nuit",
    image:
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop",
    flag: "🇹🇳",
  },
  {
    id: 3,
    destination: "Omra",
    type: "Programme Éco",
    date: "25 Mar - 2026",
    price: "3200",
    currency: "TND",
    priceUnit: "",
    image:
      "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=600&h=400&fit=crop",
    flag: "🇸🇦",
  },
]

export function FlashOffers() {
  const { t } = useLanguageCurrency()
  return (
    <section className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-foreground mb-8 text-2xl font-bold sm:text-3xl">
          {t("flash_offers.title")}
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
                  className="absolute top-3 left-3 bg-[#1e3a5f] font-medium text-white"
                >
                  {t("flash_offers.badge")}
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
                  {offer.date && (
                    <span className="text-muted-foreground text-xs">
                      {offer.date}
                    </span>
                  )}
                </div>

                <div className="border-border flex items-center justify-between border-t pt-2">
                  <div>
                    <span className="text-xl font-bold text-orange-500 sm:text-2xl">
                      {offer.price} {offer.currency}
                    </span>
                    {offer.priceUnit && (
                      <span className="text-muted-foreground ml-1 text-sm">
                        {offer.priceUnit}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
                  >
                    {t("flash_offers.book")}
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
