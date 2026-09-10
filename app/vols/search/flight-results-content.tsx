"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { ArrowRight, Info, Luggage, Plane, RefreshCw, Users } from "lucide-react"
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
  parseFlightSearchParams,
  flightStateToApiParams,
  airportLabel,
  type FlightSearchState,
} from "@/lib/vols/search-state"
import type { FlightOffer } from "@/lib/vols/client"

type SortMode = "recommended" | "price_asc" | "price_desc" | "duration_asc"

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recommended", label: "Recommandés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "duration_asc", label: "Durée la plus courte" },
]

function sortOffers(offers: FlightOffer[], mode: SortMode): FlightOffer[] {
  const copy = [...offers]
  switch (mode) {
    case "price_asc":
      return copy.sort((a, b) => a.priceTnd - b.priceTnd)
    case "price_desc":
      return copy.sort((a, b) => b.priceTnd - a.priceTnd)
    case "duration_asc":
      return copy.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)
    case "recommended":
    default:
      // Documenté, non opaque : direct d'abord, puis prix croissant.
      return copy.sort((a, b) => {
        if (a.stops !== b.stops) return a.stops - b.stops
        return a.priceTnd - b.priceTnd
      })
  }
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`
}

function formatTime(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm")
  } catch {
    return "—"
  }
}

function formatDateHeader(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEEE d MMMM yyyy", { locale: fr })
  } catch {
    return dateStr
  }
}

function FlightCard({ offer }: { offer: FlightOffer }) {
  const segment = offer.segments[0]
  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <Plane className="text-primary h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-foreground text-lg font-bold tabular-nums">
                {formatTime(segment.departureAt)}
              </span>
              <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <span className="text-foreground text-lg font-bold tabular-nums">
                {formatTime(segment.arrivalAt)}
              </span>
              <span className="text-muted-foreground text-sm">
                {offer.segments[0].origin} → {offer.segments[offer.segments.length - 1].destination}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>{segment.carrier} {segment.flightNumber}</span>
              <span>{formatMinutes(offer.totalDurationMinutes)}</span>
              <span>{offer.stops === 0 ? "Vol direct" : `${offer.stops} escale${offer.stops > 1 ? "s" : ""}`}</span>
              {offer.baggageKg != null && (
                <span className="inline-flex items-center gap-1">
                  <Luggage className="h-3 w-3" />
                  {offer.baggageKg} kg
                </span>
              )}
              {offer.refundable && (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                  Remboursable
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <div className="text-right">
            <p className="text-muted-foreground text-xs">À partir de</p>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {offer.priceTnd.toLocaleString("fr-FR")} {offer.currency}
            </p>
          </div>
          {/* Pas de vrai fournisseur/PNR derrière ce prix (mode démo, voir
              lib/vols/client.ts) : réservation volontairement non proposée
              ici plutôt que de simuler un achat de billet réel — voir
              EASYV4_VOLS_RESULTS_REPORT.md. */}
          <Button size="sm" disabled title="Réservation vols — bientôt disponible">
            Réserver — bientôt
          </Button>
        </div>
      </div>
    </div>
  )
}

function FlightSearchSummary({
  state,
  count,
  isDemo,
}: {
  state: FlightSearchState
  count: number
  isDemo: boolean
}) {
  const paxLabel = `${state.adults} adulte${state.adults > 1 ? "s" : ""}${state.children > 0 ? `, ${state.children} enfant${state.children > 1 ? "s" : ""}` : ""}`
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-xl font-bold">
            {airportLabel(state.origin)} → {airportLabel(state.destination)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDateHeader(state.departureDate)}
            {state.returnDate ? ` · retour ${formatDateHeader(state.returnDate)}` : " · aller simple"}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {paxLabel}
            </span>
            {" · "}
            {count} vol{count > 1 ? "s" : ""} trouvé{count > 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/vols?origin=${state.origin}&destination=${state.destination}&cabin=${state.cabin}&adults=${state.adults}`}>
            Modifier la recherche
          </Link>
        </Button>
      </div>
      {isDemo && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Résultats à titre indicatif.</strong> La connexion à un fournisseur de vols
            réel n&apos;est pas encore configurée — ces vols, horaires et prix sont des exemples,
            pas une disponibilité réelle. La réservation en ligne n&apos;est pas encore proposée.
          </p>
        </div>
      )}
    </div>
  )
}

export function FlightResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const parsed = useMemo(() => parseFlightSearchParams(searchParams), [searchParams])
  const requestKey = parsed.ok ? JSON.stringify(parsed.state) : null

  // Pas de setState synchrone dans l'effet (règle react-hooks/set-state-in-effect,
  // même pattern que lib/mygo/use-hotel-search.ts) : on stocke la clé de requête
  // qui a produit la donnée et on dérive le statut au rendu plutôt que de mettre
  // "loading" avant le fetch.
  const [fetchState, setFetchState] = useState<{
    requestKey: string | null
    status: "idle" | "success" | "error"
    offers: FlightOffer[]
    error: string | null
  }>({ requestKey: null, status: "idle", offers: [], error: null })
  const [sortMode, setSortMode] = useState<SortMode>("recommended")
  const [directOnly, setDirectOnly] = useState(false)
  const [refundableOnly, setRefundableOnly] = useState(false)

  useEffect(() => {
    if (!parsed.ok || !requestKey) return
    const ctrl = new AbortController()
    const qs = flightStateToApiParams(parsed.state).toString()
    fetch(`/api/vols/search?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<{ ok: true; offers: FlightOffer[]; searchId: string }>
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
    if (directOnly) result = result.filter((o) => o.stops === 0)
    if (refundableOnly) result = result.filter((o) => o.refundable)
    return sortOffers(result, sortMode)
  }, [offers, directOnly, refundableOnly, sortMode])

  if (!parsed.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-6 text-sm">
          <p className="font-semibold">Recherche incomplète</p>
          <p className="mt-1">{parsed.error}</p>
          <Button asChild variant="outline" className="mt-3">
            <Link href="/vols">Retour à la recherche</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <FlightSearchSummary
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
          <p className="font-semibold">Le service de recherche de vols est indisponible</p>
          <p className="mt-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
            onClick={() => router.replace(`/vols/search?${searchParams.toString()}`)}
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
                id="direct-only"
                checked={directOnly}
                onCheckedChange={(v) => setDirectOnly(v === true)}
              />
              <label htmlFor="direct-only" className="cursor-pointer text-sm">
                Vols directs uniquement
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="refundable-only"
                checked={refundableOnly}
                onCheckedChange={(v) => setRefundableOnly(v === true)}
              />
              <label htmlFor="refundable-only" className="cursor-pointer text-sm">
                Remboursable uniquement
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
                Aucun vol ne correspond aux filtres sélectionnés.
              </div>
            ) : (
              filteredSorted.map((offer) => <FlightCard key={offer.id} offer={offer} />)
            )}
          </div>
        </div>
      )}
    </main>
  )
}
