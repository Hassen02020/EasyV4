"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { Coffee, Info, MapPin, RefreshCw, ShieldCheck, Star, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  parseWorldHotelSearchParams,
  worldHotelStateToApiParams,
  type WorldHotelSearchState,
} from "@/lib/hotels-monde/search-state"
import type { WorldHotelOffer } from "@/lib/hotels-monde/client"

type SortMode = "recommended" | "price_asc" | "price_desc" | "rating_desc"

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recommended", label: "Recommandés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "rating_desc", label: "Mieux notés" },
]

function sortOffers(offers: WorldHotelOffer[], mode: SortMode): WorldHotelOffer[] {
  const copy = [...offers]
  switch (mode) {
    case "price_asc":
      return copy.sort((a, b) => a.totalPriceTnd - b.totalPriceTnd)
    case "price_desc":
      return copy.sort((a, b) => b.totalPriceTnd - a.totalPriceTnd)
    case "rating_desc":
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    case "recommended":
    default:
      // Documenté, non opaque : mieux notés d'abord, puis prix croissant.
      return copy.sort((a, b) => {
        const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0)
        if (Math.abs(ratingDiff) > 0.3) return ratingDiff
        return a.totalPriceTnd - b.totalPriceTnd
      })
  }
}

function formatDateHeader(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d MMMM yyyy", { locale: fr })
  } catch {
    return dateStr
  }
}

function HotelCard({ offer }: { offer: WorldHotelOffer }) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
            <MapPin className="text-primary h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground text-lg font-bold">{offer.name}</span>
              {offer.stars != null && (
                <span className="text-amber-500 inline-flex items-center gap-0.5 text-xs">
                  {Array.from({ length: offer.stars }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-current" />
                  ))}
                </span>
              )}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>{offer.city}, {offer.country}</span>
              {offer.distanceFromCenterKm != null && (
                <span>{offer.distanceFromCenterKm} km du centre</span>
              )}
              {offer.rating != null && (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                  {offer.rating.toFixed(1)}/10
                  {offer.reviewCount != null ? ` · ${offer.reviewCount} avis` : ""}
                </Badge>
              )}
              {offer.breakfastIncluded && (
                <span className="inline-flex items-center gap-1">
                  <Coffee className="h-3 w-3" />
                  Petit-déjeuner inclus
                </span>
              )}
              {offer.refundable && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Annulation gratuite
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <div className="text-right">
            <p className="text-muted-foreground text-xs">
              {offer.nights} nuit{offer.nights > 1 ? "s" : ""} · à partir de
            </p>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {offer.totalPriceTnd.toLocaleString("fr-FR")} {offer.currency}
            </p>
          </div>
          {/* Pas de vrai fournisseur (Expedia/Booking) derrière ce prix
              (mode démo, voir lib/hotels-monde/client.ts) : réservation
              volontairement non proposée plutôt que de simuler un achat réel. */}
          <Button size="sm" disabled title="Réservation hôtels monde — bientôt disponible">
            Réserver — bientôt
          </Button>
        </div>
      </div>
    </div>
  )
}

function WorldHotelSearchSummary({
  state,
  count,
  isDemo,
}: {
  state: WorldHotelSearchState
  count: number
  isDemo: boolean
}) {
  const paxLabel = `${state.adults} adulte${state.adults > 1 ? "s" : ""} · ${state.rooms} chambre${state.rooms > 1 ? "s" : ""}`
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-xl font-bold">
            Hôtels à {state.city}, {state.country}
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDateHeader(state.checkIn)} → {formatDateHeader(state.checkOut)}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {paxLabel}
            </span>
            {" · "}
            {count} hôtel{count > 1 ? "s" : ""} trouvé{count > 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/hotels-monde?destination=${state.destination}`}>
            Modifier la recherche
          </Link>
        </Button>
      </div>
      {isDemo && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Résultats à titre indicatif.</strong> La connexion à un fournisseur hôtelier
            international réel n&apos;est pas encore configurée — ces hôtels et prix sont des
            exemples, pas une disponibilité réelle. La réservation en ligne n&apos;est pas encore
            proposée.
          </p>
        </div>
      )}
    </div>
  )
}

export function WorldHotelResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const parsed = useMemo(() => parseWorldHotelSearchParams(searchParams), [searchParams])
  const requestKey = parsed.ok ? JSON.stringify(parsed.state) : null

  // Pas de setState synchrone dans l'effet (règle react-hooks/set-state-in-effect,
  // même pattern que app/vols/search/flight-results-content.tsx).
  const [fetchState, setFetchState] = useState<{
    requestKey: string | null
    status: "idle" | "success" | "error"
    offers: WorldHotelOffer[]
    error: string | null
  }>({ requestKey: null, status: "idle", offers: [], error: null })
  const [sortMode, setSortMode] = useState<SortMode>("recommended")
  const [breakfastOnly, setBreakfastOnly] = useState(false)
  const [refundableOnly, setRefundableOnly] = useState(false)

  useEffect(() => {
    if (!parsed.ok || !requestKey) return
    const ctrl = new AbortController()
    const qs = worldHotelStateToApiParams(parsed.state).toString()
    fetch(`/api/hotels-monde/search?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<{ ok: true; offers: WorldHotelOffer[]; searchId: string }>
      })
      .then((data) => {
        setFetchState({ requestKey, status: "success", offers: data.offers, error: null })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return
        setFetchState({
          requestKey,
          status: "error",
          offers: [],
          error: err instanceof Error ? err.message : "Erreur inconnue",
        })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const status: "loading" | "success" | "error" =
    !requestKey || fetchState.requestKey !== requestKey
      ? "loading"
      : fetchState.status === "idle"
        ? "loading"
        : fetchState.status
  const offers = useMemo(
    () => (fetchState.requestKey === requestKey ? fetchState.offers : []),
    [fetchState, requestKey],
  )
  const error = fetchState.requestKey === requestKey ? fetchState.error : null

  const filteredSorted = useMemo(() => {
    let result = offers
    if (breakfastOnly) result = result.filter((o) => o.breakfastIncluded)
    if (refundableOnly) result = result.filter((o) => o.refundable)
    return sortOffers(result, sortMode)
  }, [offers, breakfastOnly, refundableOnly, sortMode])

  if (!parsed.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
          <p className="font-semibold">Recherche incomplète</p>
          <p className="mt-1">{parsed.error}</p>
          <Button asChild variant="outline" className="mt-3">
            <Link href="/hotels-monde">Retour à la recherche</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <WorldHotelSearchSummary
        state={parsed.state}
        count={filteredSorted.length}
        isDemo={offers.some((o) => o.source === "demo")}
      />

      {status === "loading" && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
          <p className="font-semibold">Le service de recherche hôtels est indisponible</p>
          <p className="mt-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
            onClick={() => router.replace(`/hotels-monde/search?${searchParams.toString()}`)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Réessayer
          </Button>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="flex shrink-0 flex-wrap items-center gap-4 lg:w-56 lg:flex-col lg:items-start">
            <div className="flex items-center gap-2">
              <Checkbox
                id="breakfast-only"
                checked={breakfastOnly}
                onCheckedChange={(v) => setBreakfastOnly(v === true)}
              />
              <label htmlFor="breakfast-only" className="cursor-pointer text-sm">
                Petit-déjeuner inclus
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="refundable-only"
                checked={refundableOnly}
                onCheckedChange={(v) => setRefundableOnly(v === true)}
              />
              <label htmlFor="refundable-only" className="cursor-pointer text-sm">
                Annulation gratuite
              </label>
            </div>
            <div className="w-full lg:mt-2">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </aside>

          <div className="flex-1 space-y-3">
            {filteredSorted.length === 0 ? (
              <div className="border-border text-muted-foreground rounded-lg border p-6 text-sm">
                Aucun hôtel ne correspond aux filtres sélectionnés.
              </div>
            ) : (
              filteredSorted.map((offer) => <HotelCard key={offer.id} offer={offer} />)
            )}
          </div>
        </div>
      )}
    </main>
  )
}
