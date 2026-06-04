import Image from "next/image"
import { Star, MapPin, Sparkles, CheckCircle2 } from "lucide-react"
import type { ProHotel } from "@/lib/pro/hotels-fixture"

interface HotelSummaryCardProps {
  hotel: ProHotel
}

/**
 * Carte résumée affichée en haut de la page détail `/pro/hotels/[id]`
 * et dans le tunnel de réservation (récapitulatif voyageurs / checkout).
 */
export function HotelSummaryCard({ hotel }: HotelSummaryCardProps) {
  return (
    <article className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
        <div className="relative aspect-[4/3] md:aspect-auto">
          <Image
            src={hotel.image ?? hotel.images[0] ?? "/placeholder.jpg"}
            alt={hotel.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 260px"
            unoptimized
          />
          {hotel.recommended ? (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase shadow-md">
              <Sparkles className="h-3 w-3" />
              Recommended
            </span>
          ) : null}
        </div>
        <div className="p-4 md:p-5">
          <div className="flex items-center gap-1.5">
            {hotel.stars
              ? Array.from({ length: hotel.stars }).map((_, i) => (
                  <Star
                    key={i}
                    className="text-accent h-3.5 w-3.5 fill-current"
                  />
                ))
              : null}
            {hotel.brand ? (
              <span className="text-muted-foreground text-xs">
                · {hotel.brand}
              </span>
            ) : null}
          </div>
          <h2 className="text-foreground mt-1 text-xl leading-tight font-bold md:text-2xl">
            {hotel.name}
          </h2>
          <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-sm">
            <MapPin className="h-3.5 w-3.5" />
            {hotel.zone ?? hotel.city}
          </p>
          <p className="text-muted-foreground mt-3 max-w-xl text-sm">
            {hotel.description}
          </p>
          <ul className="text-muted-foreground mt-3 grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
            {(hotel.perks ?? []).slice(0, 4).map((p) => (
              <li key={p} className="inline-flex items-start gap-1.5">
                <CheckCircle2 className="text-accent mt-0.5 h-3 w-3 shrink-0" />
                <span className="leading-snug">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}
