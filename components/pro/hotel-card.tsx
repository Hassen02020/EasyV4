"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Star,
  Sparkles,
  CheckCircle2,
  MapPin,
  ArrowRight,
  Wifi,
  Waves,
  Utensils,
  ParkingCircle,
  Dumbbell,
  Baby,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  type ProHotel,
  BOARDING_LABEL,
  BOARDING_SHORT,
  minBoardingPrice,
} from "@/lib/pro/hotels-fixture"
import { formatTND } from "@/lib/pro/format"

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  pool: Waves,
  spa: Sparkles,
  parking: ParkingCircle,
  restaurant: Utensils,
  beach: Waves,
  gym: Dumbbell,
  "kids-club": Baby,
}

interface HotelCardProps {
  hotel: ProHotel
  /** Lien vers la page de détail (composition libre). */
  detailHref: string
}

export function HotelCard({ hotel, detailHref }: HotelCardProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "details">("summary")
  const fromPrice = minBoardingPrice(hotel) ?? 0

  return (
    <article
      className="bg-card border-border/60 shadow-e2b-soft hover:shadow-e2b-elevated overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5"
      aria-labelledby={`hotel-${hotel.id}-title`}
    >
      <div className="grid gap-0 md:grid-cols-[280px_1fr]">
        <div className="relative aspect-[4/3] md:aspect-auto">
          <Image
            src={hotel.image ?? hotel.images[0] ?? "/placeholder.jpg"}
            alt={hotel.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 280px"
            unoptimized
          />
          {hotel.recommended ? (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase shadow-md">
              <Sparkles className="h-3 w-3" />
              Recommended
            </span>
          ) : null}
          {hotel.childOffer ? (
            <span className="absolute bottom-3 left-3 rounded-md bg-emerald-600/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md">
              {hotel.childOffer}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {hotel.stars ? (
                  <span
                    className="inline-flex items-center gap-0.5"
                    aria-label={`${hotel.stars} étoiles`}
                  >
                    {Array.from({ length: hotel.stars }).map((_, i) => (
                      <Star
                        key={i}
                        className="text-accent h-3.5 w-3.5 fill-current"
                      />
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs uppercase">
                    {hotel.category ?? "Catégorie"}
                  </span>
                )}
                {hotel.brand ? (
                  <span className="text-muted-foreground text-xs">
                    · {hotel.brand}
                  </span>
                ) : null}
              </div>
              <h3
                id={`hotel-${hotel.id}-title`}
                className="text-foreground mt-0.5 text-lg leading-tight font-semibold"
              >
                {hotel.name}
              </h3>
              <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
                <MapPin className="h-3 w-3" />
                {hotel.zone ?? hotel.city}
              </p>
            </div>
            {hotel.rating ? (
              <div className="bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold">
                <span className="text-[10px] uppercase">
                  {hotel.rating.label}
                </span>
                <span className="font-bold tabular-nums">
                  {hotel.rating.score.toFixed(1)}
                </span>
                <span className="text-[10px] opacity-80">
                  {hotel.rating.reviews} avis
                </span>
              </div>
            ) : null}
          </div>

          <div className="border-border/60 mt-3 flex gap-1 border-b">
            <TabButton
              active={activeTab === "summary"}
              onClick={() => setActiveTab("summary")}
            >
              Résumé
            </TabButton>
            <TabButton
              active={activeTab === "details"}
              onClick={() => setActiveTab("details")}
            >
              Détails
            </TabButton>
          </div>

          <div className="min-h-[100px] py-3">
            {activeTab === "summary" ? (
              <div className="flex flex-wrap gap-1.5">
                {(hotel.segments ?? []).slice(0, 4).map((seg) => (
                  <span
                    key={seg}
                    className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                  >
                    {seg}
                  </span>
                ))}
                {hotel.amenities.slice(0, 6).map((amenity) => {
                  const Icon = AMENITY_ICONS[amenity]
                  if (!Icon) return null
                  return (
                    <span
                      key={amenity}
                      className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                      title={amenity}
                    >
                      <Icon className="h-3 w-3" />
                      {amenity.replace("-", " ")}
                    </span>
                  )
                })}
              </div>
            ) : (
              <ul className="text-muted-foreground space-y-1 text-sm">
                {(hotel.perks ?? []).slice(0, 4).map((p) => (
                  <li key={p} className="inline-flex items-start gap-1.5">
                    <CheckCircle2 className="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-foreground/90 leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-border/60 mt-auto flex flex-wrap items-end justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap gap-1.5">
              {hotel.boardings.map((b) => (
                <span
                  key={b}
                  className="border-secondary/50 text-secondary bg-secondary/5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
                  title={BOARDING_LABEL[b]}
                >
                  <span className="text-[10px] font-bold opacity-70">
                    {BOARDING_SHORT[b]}
                  </span>
                  <span className="hidden md:inline">
                    {BOARDING_LABEL[b]}
                  </span>
                </span>
              ))}
            </div>

            <div className="text-right">
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                À partir de
              </div>
              <div className="text-primary text-xl font-bold tabular-nums">
                {formatTND(fromPrice)}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
                <CheckCircle2 className="h-3 w-3" />
                Disponible
              </div>
            </div>
          </div>

          <Button
            asChild
            className="mt-3 w-full rounded-xl md:w-auto md:self-end"
          >
            <Link
              href={detailHref}
              aria-label={`Voir la chambre — ${hotel.name}`}
            >
              Choisir la chambre
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active ? (
        <span
          aria-hidden
          className="bg-primary absolute right-0 -bottom-px left-0 h-0.5"
        />
      ) : null}
    </button>
  )
}
