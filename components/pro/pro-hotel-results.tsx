"use client"

/**
 * Résultats hôtels B2B — Phase 8.
 *
 * Reçoit les offres myGo réelles déjà chargées et marginées côté serveur
 * (`app/pro/(app)/hotels/page.tsx` → `runHotelSearch` + `applyMarginToHotelOffer`,
 * lib/mygo/search-core.ts / lib/pro/pricing.ts) — ce composant ne fait
 * JAMAIS d'appel réseau lui-même. Filtrage/tri réutilisent tels quels le
 * moteur B2C déjà validé (`lib/mygo/facets.ts`, `lib/mygo/sort.ts`) — même
 * principe que `app/hotels/search/page.tsx` : changer un filtre ou le tri
 * ne redéclenche jamais une recherche myGo.
 *
 * Volontairement PAS une réutilisation de `components/hotel-listings.tsx`/
 * `components/hotel-card.tsx` (B2C) : ces composants pointent en dur vers
 * le pipeline de réservation B2C (`encodeDraft`/`/booking`, wallet B2C) et
 * la fiche hôtel publique `/hotels/[id]` — les réutiliser tels quels
 * routerait un agent B2B vers le mauvais tunnel de réservation. La UI de
 * filtres/tri (`FilterSidebar`/`FilterChips`/`MobileFilterSortBar`/
 * `SortSelect`), elle, est déjà générique sur `HotelFacets`/
 * `HotelFilterState` sans aucun couplage booking — réutilisée telle quelle.
 */

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { MapPin, Calendar, Users, Star, ArrowRight, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  FilterSidebar,
  FilterChips,
  MobileFilterSortBar,
} from "@/components/filter-sidebar"
import { SortSelect } from "@/components/sort-select"
import {
  applyFilters,
  computeFacets,
  filtersToSearchParams,
  FILTER_URL_KEYS,
  hasFreeCancellation,
  type HotelFilterState,
} from "@/lib/mygo/facets"
import { sortOffers, type HotelSortMode } from "@/lib/mygo/sort"
import type { HotelOfferDTO } from "@/lib/mygo/types"

interface ProHotelResultsProps {
  /** Offres myGo réelles, déjà marginées (prix agence, TND TTC). */
  offers: HotelOfferDTO[]
  currency: string
  initialFilters: HotelFilterState
  initialSortMode: HotelSortMode
  context: {
    destinationLabel: string
    checkin?: string
    checkout?: string
    nights?: number
    adults?: number
    children?: number
    /** Requis pour construire le lien vers la fiche hôtel B2B (`/pro/hotels/[id]` attend cityId+checkin+checkout+adults). */
    cityId?: number
    /** Âges enfants réels (pas juste le compte) — reportés tels quels sur la fiche hôtel, comme côté B2C. */
    childrenAges?: number[]
  }
}

function ProHotelResultCard({
  offer,
  currency,
  detailHref,
}: {
  offer: HotelOfferDTO
  currency: string
  /** `null` quand les paramètres de recherche (cityId/dates) sont incomplets — CTA désactivé plutôt que de router vers une fiche cassée. */
  detailHref: string | null
}) {
  const boardingNames = Array.from(
    new Set(offer.boardings.map((b) => b.name).filter(Boolean)),
  )
  // PHASE 30.2 — même donnée/logique réelle que le filtre "Annulation
  // gratuite seulement" (lib/mygo/facets.ts), affichée directement sur la
  // card B2B pour répondre à "l'annulation est-elle gratuite ?" sans ouvrir
  // la fiche hôtel — parité avec la card B2C (components/hotel-card.tsx).
  const freeCancellation = hasFreeCancellation(offer)
  return (
    <article className="bg-card border-border/60 shadow-e2b-soft overflow-hidden rounded-2xl border">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {offer.hotel.stars ? (
              <span className="inline-flex items-center gap-0.5">
                {Array.from({ length: offer.hotel.stars }).map((_, i) => (
                  <Star key={i} className="text-accent h-3.5 w-3.5 fill-current" />
                ))}
              </span>
            ) : null}
            {offer.recommended && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                Recommandé
              </Badge>
            )}
          </div>
          <h3 className="text-foreground mt-0.5 text-lg leading-tight font-semibold">
            {detailHref ? (
              <Link href={detailHref} className="hover:text-primary hover:underline">
                {offer.hotel.name}
              </Link>
            ) : (
              offer.hotel.name
            )}
          </h3>
          <p className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3" />
            {offer.hotel.cityName ?? "—"}
          </p>
          {boardingNames.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boardingNames.map((name) => (
                <span
                  key={name}
                  className="border-secondary/50 text-secondary bg-secondary/5 inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <div className="text-right">
            <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Prix agence, à partir de
            </p>
            <p className="text-primary text-xl font-bold tabular-nums">
              {offer.fromPrice.toLocaleString("fr-FR")} {currency}
            </p>
            {freeCancellation && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Annulation gratuite
              </p>
            )}
          </div>
          {/* PHASE 30 — la fiche hôtel B2B (app/pro/(app)/hotels/[id]/page.tsx)
              et le sélecteur de chambres (ProRoomSelector) sont branchés sur
              le vrai moteur myGo depuis la Phase 9 et tout le tunnel jusqu'à
              createReservationFromDraft est réel et testé (voir audit Phase
              30) — seul CE lien manquait pour l'atteindre depuis la SERP. */}
          {detailHref ? (
            <Link
              href={detailHref}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            >
              Voir les chambres
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Dates de recherche incomplètes"
              className="border-border text-muted-foreground cursor-not-allowed rounded-xl border px-4 py-2 text-sm font-medium opacity-60"
            >
              Voir les chambres
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export function ProHotelResults({
  offers,
  currency,
  initialFilters,
  initialSortMode,
  context,
}: ProHotelResultsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filters, setFiltersState] = useState<HotelFilterState>(initialFilters)
  const [sortMode, setSortModeState] = useState<HotelSortMode>(initialSortMode)

  const updateFilters = (next: HotelFilterState) => {
    setFiltersState(next)
    const params = new URLSearchParams(searchParams.toString())
    for (const key of FILTER_URL_KEYS) params.delete(key)
    filtersToSearchParams(next).forEach((value, key) => params.set(key, value))
    router.replace(`/pro/hotels?${params.toString()}`, { scroll: false })
  }

  const updateSort = (mode: HotelSortMode) => {
    setSortModeState(mode)
    const params = new URLSearchParams(searchParams.toString())
    if (mode === "recommended") params.delete("sort")
    else params.set("sort", mode)
    router.replace(`/pro/hotels?${params.toString()}`, { scroll: false })
  }

  // Lien fiche hôtel commun à toutes les cards — `null` si la recherche
  // n'a pas les paramètres requis par /pro/hotels/[id] (cityId+dates),
  // auquel cas le CTA reste désactivé plutôt que de router vers une 404.
  const detailBaseParams = useMemo(() => {
    if (!context.cityId || !context.checkin || !context.checkout) return null
    const p = new URLSearchParams({
      cityId: String(context.cityId),
      checkin: context.checkin,
      checkout: context.checkout,
      adults: String(context.adults ?? 2),
    })
    if (context.childrenAges && context.childrenAges.length > 0) {
      p.set("children", context.childrenAges.join(","))
    }
    return p
  }, [context.cityId, context.checkin, context.checkout, context.adults, context.childrenAges])

  const facets = useMemo(
    () => (offers.length > 0 ? computeFacets(offers) : null),
    [offers],
  )
  const filteredOffers = useMemo(
    () => applyFilters(offers, filters),
    [offers, filters],
  )
  const sortedOffers = useMemo(
    () => sortOffers(filteredOffers, sortMode, filters.boardings),
    [filteredOffers, sortMode, filters.boardings],
  )

  const paxLabel = context.adults
    ? `${context.adults} adulte${context.adults > 1 ? "s" : ""}${
        context.children ? `, ${context.children} enfant${context.children > 1 ? "s" : ""}` : ""
      }`
    : "Voyageurs"

  return (
    <div className="space-y-5">
      <header className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4">
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
            <span className="text-muted-foreground">{paxLabel}</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Tarifs nets agence (marge appliquée) — TND TTC
        </p>
      </header>

      <MobileFilterSortBar
        facets={facets}
        filterState={filters}
        onFilterChange={updateFilters}
        sortMode={sortMode}
        onSortChange={updateSort}
        currency={currency}
        hasResults={sortedOffers.length > 0}
      />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          state={filters}
          facets={facets}
          currency={currency}
          onChange={updateFilters}
        />
        {sortedOffers.length > 0 && (
          <div className="hidden lg:block">
            <SortSelect value={sortMode} onChange={updateSort} />
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="hidden lg:block">
          <FilterSidebar
            facets={facets}
            state={filters}
            onChange={updateFilters}
            currency={currency}
          />
        </div>

        <div className="space-y-4">
          {sortedOffers.length === 0 ? (
            <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-10 text-center">
              <p className="text-foreground text-base font-semibold">
                {offers.length === 0
                  ? "Aucun hôtel disponible pour cette recherche"
                  : "Aucun hôtel ne correspond aux filtres sélectionnés"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {offers.length === 0
                  ? "Essayez d'autres dates ou une autre destination."
                  : `${offers.length} hôtel${offers.length > 1 ? "s" : ""} trouvé${offers.length > 1 ? "s" : ""} pour cette recherche — essayez d'élargir vos filtres.`}
              </p>
              {offers.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    updateFilters({
                      stars: [],
                      boardings: [],
                      facilities: [],
                      priceRange: null,
                      recommendedOnly: false,
                      freeCancellationOnly: false,
                      availableOnly: false,
                    })
                  }
                  className="text-primary mt-3 text-sm font-medium hover:underline"
                >
                  Effacer tous les filtres
                </button>
              )}
            </div>
          ) : (
            sortedOffers.map((offer) => (
              <ProHotelResultCard
                key={offer.hotel.id}
                offer={offer}
                currency={currency}
                detailHref={
                  detailBaseParams ? `/pro/hotels/${offer.hotel.id}?${detailBaseParams.toString()}` : null
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
