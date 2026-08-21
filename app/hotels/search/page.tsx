"use client"

import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { SearchHeader } from "@/components/search-header"
import { FilterSidebar, FilterChips, MobileFilterSortBar } from "@/components/filter-sidebar"
import { HotelListings } from "@/components/hotel-listings"
import { useHotelSearch } from "@/lib/mygo/use-hotel-search"
import {
  applyFilters,
  computeFacets,
  EMPTY_FILTER_STATE,
  filtersFromSearchParams,
  filtersToSearchParams,
  FILTER_URL_KEYS,
  type HotelFilterState,
} from "@/lib/mygo/facets"
import {
  sortOffers,
  isHotelSortMode,
  DEFAULT_SORT_MODE,
  type HotelSortMode,
} from "@/lib/mygo/sort"
import { SortSelect } from "@/components/sort-select"
import { encodeDraft } from "@/lib/booking/draft-store"
import { Skeleton } from "@/components/ui/skeleton"

interface BookingData {
  id: number
  name: string
  location: string
  image: string
  roomType: string
  mealPlan: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  children: number
  pricePerNight: number
  totalPrice: number
  myGoToken: string
  cityId?: number
  boardingId: number
  boardingCode: string
  roomId: number
}

function formatDateRange(checkin: string | null, checkout: string | null) {
  if (!checkin || !checkout) return "Sélectionner les dates"
  try {
    const from = parseISO(checkin)
    const to = parseISO(checkout)
    return `${format(from, "dd MMM", { locale: fr })} - ${format(to, "dd MMM yyyy", { locale: fr })}`
  } catch {
    return "Sélectionner les dates"
  }
}

function HotelSearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Filtres et tri initialisés depuis l'URL (lazy init) — survivent à un
  // rafraîchissement de page et à un aller-retour vers la fiche hôtel.
  const [filters, setFiltersState] = useState<HotelFilterState>(() =>
    filtersFromSearchParams(searchParams),
  )
  const [sortMode, setSortModeState] = useState<HotelSortMode>(() => {
    const raw = searchParams.get("sort")
    return isHotelSortMode(raw) ? raw : DEFAULT_SORT_MODE
  })

  const { status, data, error, errorCode, degraded, fromStaleCache, retry } =
    useHotelSearch()

  // Changer un filtre/le tri ne redéclenche JAMAIS un appel myGo (le hook
  // ci-dessus ne dépend que des paramètres de recherche myGo eux-mêmes) —
  // on met juste à jour l'URL (replace, pas d'entrée d'historique par clic)
  // pour que l'état survive à un refresh/partage de lien.
  const updateFilters = (next: HotelFilterState) => {
    setFiltersState(next)
    const params = new URLSearchParams(searchParams.toString())
    for (const key of FILTER_URL_KEYS) params.delete(key)
    filtersToSearchParams(next).forEach((value, key) => params.set(key, value))
    router.replace(`/hotels/search?${params.toString()}`, { scroll: false })
  }

  const updateSort = (mode: HotelSortMode) => {
    setSortModeState(mode)
    const params = new URLSearchParams(searchParams.toString())
    if (mode === DEFAULT_SORT_MODE) params.delete("sort")
    else params.set("sort", mode)
    router.replace(`/hotels/search?${params.toString()}`, { scroll: false })
  }

  const cityName = searchParams.get("city") ?? "Hammamet"
  const checkin = searchParams.get("checkin")
  const checkout = searchParams.get("checkout")
  const adultsStr = searchParams.get("adults") ?? "2"
  const adults = Number(adultsStr)
  const childrenStr = searchParams.get("children")
  const children = childrenStr?.split(",").filter(Boolean).length ?? 0

  const dateRange = formatDateRange(checkin, checkout)
  const paxLabel =
    children > 0
      ? `${adults} Adulte${adults > 1 ? "s" : ""}, ${children} Enfant${children > 1 ? "s" : ""}`
      : `${adults} Adulte${adults > 1 ? "s" : ""}`

  const allOffers = useMemo(() => data?.offers ?? [], [data])
  const currency = data?.offers?.[0]?.currency ?? "TND"

  const facets = useMemo(
    () => (allOffers.length > 0 ? computeFacets(allOffers) : null),
    [allOffers],
  )

  const filteredOffers = useMemo(
    () => applyFilters(allOffers, filters),
    [allOffers, filters],
  )

  // Tri appliqué APRÈS le filtrage — toujours côté client sur les offres
  // déjà chargées, jamais un nouvel appel myGo (voir lib/mygo/sort.ts).
  // `filters.boardings` transmis pour que le tri prix suive le même prix
  // que celui réellement affiché sur chaque card (Best Rate Engine) plutôt
  // que le prix le moins cher toutes pensions confondues.
  const sortedOffers = useMemo(
    () => sortOffers(filteredOffers, sortMode, filters.boardings),
    [filteredOffers, sortMode, filters.boardings],
  )

  // Chaîne de requête complète actuelle — transmise telle quelle à la fiche
  // hôtel (destination, dates, occupation, filtres, tri…) pour que "Voir
  // détails" puis "Retour aux résultats" ne perde aucun état.
  const currentSearchQuery = searchParams.toString()

  const handleBookHotel = (hotelData: BookingData) => {
    const unitPriceTnd =
      hotelData.adults > 0
        ? hotelData.totalPrice / hotelData.adults
        : hotelData.totalPrice
    // Âges réels des enfants (CSV depuis l'URL de recherche, ex. "5,8") — myGo
    // exige un âge par enfant dans BookingCreation, pas seulement un décompte.
    const childrenAgesArr = (childrenStr ?? "")
      .split(",")
      .map((a) => parseInt(a, 10))
      .filter((n) => Number.isFinite(n))
    const token = encodeDraft({
      draft: {
        module: "hotel",
        offerId: String(hotelData.id),
        offerLabel: `${hotelData.name} — ${hotelData.roomType}`,
        startDate: hotelData.checkIn,
        endDate: hotelData.checkOut,
        adults: hotelData.adults,
        children: hotelData.children,
        unitPriceTnd,
        currency: "TND",
        metadata: {
          hotelImage: hotelData.image,
          mealPlan: hotelData.mealPlan,
          nights: hotelData.nights,
          location: hotelData.location,
          // Requis pour confirmer réellement la réservation auprès de myGo
          // (BookingCreation) — voir lib/booking/hotel-provider-booking.ts
          myGoToken: hotelData.myGoToken,
          cityId: hotelData.cityId,
          hotelId: hotelData.id,
          boardingId: hotelData.boardingId,
          boardingCode: hotelData.boardingCode,
          roomId: hotelData.roomId,
          childrenAges: childrenAgesArr,
        },
      },
    })
    router.push(`/booking?d=${encodeURIComponent(token)}`)
  }

  return (
    <div className="bg-background min-h-screen">
      <SearchHeader city={cityName} dateRange={dateRange} paxLabel={paxLabel} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="hidden shrink-0 lg:block lg:w-1/4">
            <FilterSidebar
              facets={facets}
              state={filters}
              onChange={updateFilters}
              currency={currency}
              disabled={status !== "success"}
              loading={status === "loading"}
            />
          </div>

          <div className="flex-1">
            <MobileFilterSortBar
              facets={facets}
              filterState={filters}
              onFilterChange={updateFilters}
              sortMode={sortMode}
              onSortChange={updateSort}
              currency={currency}
              disabled={status !== "success"}
              loading={status === "loading"}
              hasResults={status === "success" && sortedOffers.length > 0}
            />
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <FilterChips
                state={filters}
                facets={facets}
                currency={currency}
                onChange={updateFilters}
              />
              {status === "success" && sortedOffers.length > 0 && (
                <div className="hidden lg:block">
                  <SortSelect value={sortMode} onChange={updateSort} />
                </div>
              )}
            </div>
            <HotelListings
              offers={sortedOffers}
              totalCount={data?.count ?? 0}
              currency={currency}
              status={status}
              error={error}
              errorCode={errorCode}
              degraded={degraded}
              fromStaleCache={fromStaleCache}
              onRetry={retry}
              cityName={cityName}
              checkin={checkin}
              checkout={checkout}
              adults={adultsStr}
              childrenAges={childrenStr}
              activeBoardFilters={filters.boardings}
              currentSearchQuery={currentSearchQuery}
              onBookHotel={handleBookHotel}
              onClearFilters={() => updateFilters(EMPTY_FILTER_STATE)}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Squelette de la coquille de page — visible seulement le temps que
 * `useSearchParams()` (frontière Suspense côté client) se résolve, avant
 * même que `useHotelSearch` ne démarre sa propre requête. Évite un flash de
 * page blanche plutôt qu'un état de chargement piloté par de vraies données.
 */
function HotelSearchPageSkeleton() {
  return (
    <div className="bg-background min-h-screen" aria-hidden="true">
      <div className="border-border border-b px-4 py-4">
        <div className="mx-auto max-w-7xl">
          <Skeleton className="h-6 w-56" />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="hidden shrink-0 lg:block lg:w-1/4">
            <div className="bg-card border-border space-y-4 rounded-lg border p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-72" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function HotelSearchPage() {
  return (
    <Suspense fallback={<HotelSearchPageSkeleton />}>
      <HotelSearchContent />
    </Suspense>
  )
}
