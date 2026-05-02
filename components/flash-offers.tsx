"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const offers = [
  {
    id: 1,
    destination: "Istanbul",
    type: "Vols + Hôtel",
    date: "15 Nov - 2026",
    price: "1450",
    currency: "TND",
    priceUnit: "",
    image: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&h=400&fit=crop",
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
    image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop",
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
    image: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=600&h=400&fit=crop",
    flag: "🇸🇦",
  },
]

export function FlashOffers() {
  return (
    <section className="py-12 sm:py-16 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
          Nos meilleures offres au départ de Tunis
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-border"
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
                  className="absolute top-3 left-3 bg-[#1e3a5f] text-white font-medium"
                >
                  Flash Offers
                </Badge>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      {offer.destination}
                      <span className="text-base">{offer.flag}</span>
                    </h3>
                    <p className="text-sm text-muted-foreground">{offer.type}</p>
                  </div>
                  {offer.date && (
                    <span className="text-xs text-muted-foreground">{offer.date}</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <span className="text-xl sm:text-2xl font-bold text-orange-500">
                      {offer.price} {offer.currency}
                    </span>
                    {offer.priceUnit && (
                      <span className="text-sm text-muted-foreground ml-1">
                        {offer.priceUnit}
                      </span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white">
                    Réserver
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
