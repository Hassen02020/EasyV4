"use client"

import { useMemo, useState } from "react"
import {
  ArrowUpDown,
  Inbox,
  MapPin,
  Calendar,
  Users,
  Pencil,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  type ProHotel,
  type HotelBoarding,
  minBoardingPrice,
} from "@/lib/pro/hotels-fixture"
import { pluralizeHotels } from "@/lib/pro/format"
import { HotelCard } from "./hotel-card"
import { HotelsFilters, type HotelFiltersState } from "./hotels-filters"

type SortKey = "recommended" | "price-asc" | "price-desc" | "rating-desc"

interface HotelsSerpProps {
  hotels: ProHotel[]
  context: {
    destinationLabel: string
    checkin?: string
    checkout?: string
    nights?: number
    rooms?: number
    adults?: number
    children?: number
  }
}

function clampPrice(p: number) {
  return Math.max(0, Math.round(p))
}

export function HotelsSerp({ hotels, context }: HotelsSerpProps) {
  // Bornes prix dynamiques basées sur les fixtures fournies
  const priceBounds = useMemo(() => {
    if (hotels.length === 0) return { min: 0, max: 5000 }
    const prices = hotels.map(minBoardingPrice)
    return {
      min: clampPrice(Math.min(...prices) - 50),
      max: clampPrice(Math.max(...prices) + 50),
    }
  }, [hotels])

  const availableStars = useMemo(() => {
    const set = new Set<number>()
    hotels.forEach((h) => {
      if (typeof h.stars === "number") set.add(h.stars)
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [hotels])

  const availableBoardings = useMemo(() => {
    const set = new Set<HotelBoarding>()
    hotels.forEach((h) => h.boardings.forEach((b) => set.add(b.type)))
    return Array.from(set).sort()
  }, [hotels])

  const defaultFilters: HotelFiltersState = useMemo(
    () => ({
      stars: [],
      boardings: [],
      priceMin: priceBounds.min,
      priceMax: priceBounds.max,
      recommendedOnly: false,
    }),
    [priceBounds.min, priceBounds.max],
  )

  const [filters, setFilters] = useState<HotelFiltersState>(defaultFilters)
  const [sort, setSort] = useState<SortKey>("recommended")

  const filtered = useMemo(() => {
    const list = hotels.filter((h) => {
      const fromPrice = minBoardingPrice(h)
      if (filters.recommendedOnly && !h.recommended) return false
      if (
        filters.stars.length > 0 &&
        (h.stars == null || !filters.stars.includes(h.stars))
      )
        return false
      if (
        filters.boardings.length > 0 &&
        !h.boardings.some((b) => filters.boardings.includes(b.type))
      )
        return false
      if (fromPrice < filters.priceMin || fromPrice > filters.priceMax)
        return false
      return true
    })
    switch (sort) {
      case "price-asc":
        return [...list].sort(
          (a, b) => minBoardingPrice(a) - minBoardingPrice(b),
        )
      case "price-desc":
        return [...list].sort(
          (a, b) => minBoardingPrice(b) - minBoardingPrice(a),
        )
      case "rating-desc":
        return [...list].sort(
          (a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0),
        )
      case "recommended":
      default:
        return [...list].sort((a, b) => {
          if (a.recommended && !b.recommended) return -1
          if (!a.recommended && b.recommended) return 1
          return (b.rating?.score ?? 0) - (a.rating?.score ?? 0)
        })
    }
  }, [hotels, filters, sort])

  const paxLabel = context.adults
    ? `${context.adults} ad${context.children ? ` · ${context.children} enf` : ""}`
    : "Voyageurs"

  return (
    <div className="space-y-5">
      <header className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-1.5 text-sm">
              <MapPin className="text-primary h-4 w-4" />
              <span className="text-foreground font-semibold">
                {context.destinationLabel}
              </span>
            </div>
            {context.checkin && context.checkout ? (
              <div className="inline-flex items-center gap-1.5 text-sm">
                <Calendar className="text-primary h-4 w-4" />
                <span className="text-muted-foreground">
                  {context.checkin} → {context.checkout}
                  {context.nights ? ` (${context.nights} nuits)` : ""}
                </span>
              </div>
            ) : null}
            <div className="inline-flex items-center gap-1.5 text-sm">
              <Users className="text-primary h-4 w-4" />
              <span className="text-muted-foreground">
                {context.rooms ?? 1} ch · {paxLabel}
              </span>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <a href="/pro">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifier
            </a>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-xl font-bold tracking-tight md:text-2xl">
            {pluralizeHotels(filtered.length)} Recommandé
            {filtered.length > 1 ? "s" : ""}
          </h1>
          <p className="text-muted-foreground text-xs">
            Tarifs nets agence — TND TTC pour {context.nights ?? 4} nuits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">
            Trier par
          </Label>
          <SortSelect value={sort} onChange={setSort} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
          <HotelsFilters
            value={filters}
            onChange={setFilters}
            priceBounds={priceBounds}
            availableStars={availableStars}
            availableBoardings={availableBoardings}
            onReset={() => setFilters(defaultFilters)}
            resultsCount={filtered.length}
          />
        </div>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-10 text-center">
              <Inbox className="text-muted-foreground mx-auto h-10 w-10" />
              <p className="text-foreground mt-3 text-base font-semibold">
                Aucun hôtel ne correspond à vos critères
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Essayez d&apos;élargir les filtres ou de modifier la destination
                / les dates.
              </p>
            </div>
          ) : (
            filtered.map((h) => (
              <HotelCard
                key={h.id}
                hotel={h}
                detailHref={`/pro/hotels/${h.id}`}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Label({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <span className={className}>{children}</span>
}

function SortSelect({
  value,
  onChange,
}: {
  value: SortKey
  onChange: (next: SortKey) => void
}) {
  return (
    <div className="bg-card border-input shadow-e2b-soft inline-flex items-center gap-1.5 rounded-xl border px-2 py-1.5">
      <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5" />
      <select
        aria-label="Trier les résultats"
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="bg-transparent text-sm focus:outline-none"
      >
        <option value="recommended">Recommandés</option>
        <option value="price-asc">Prix croissant</option>
        <option value="price-desc">Prix décroissant</option>
        <option value="rating-desc">Note décroissante</option>
      </select>
    </div>
  )
}
