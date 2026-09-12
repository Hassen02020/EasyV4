"use client"

import { useEffect, useMemo, useState } from "react"
import { Link, useRouter } from "@/i18n/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { format, parseISO } from "date-fns"
import type { Locale as DateFnsLocale } from "date-fns"
import { getDateFnsLocale, getIntlLocale } from "@/lib/i18n-date"
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

function formatDateHeader(dateStr: string, dateFnsLocale: DateFnsLocale): string {
  try {
    return format(parseISO(dateStr), "EEEE d MMMM yyyy", { locale: dateFnsLocale })
  } catch {
    return dateStr
  }
}

function bookingHref(offer: FlightOffer, state: FlightSearchState): string | null {
  if (!offer.offerToken) return null
  const firstSegment = offer.segments[0]
  const lastSegment = offer.segments[offer.segments.length - 1]
  const params = new URLSearchParams({
    token: offer.offerToken,
    price: String(offer.priceTnd),
    currency: offer.currency,
    origin: firstSegment.origin,
    destination: lastSegment.destination,
    departureAt: firstSegment.departureAt,
    arrivalAt: lastSegment.arrivalAt,
    carrier: firstSegment.carrier,
    flightNumber: firstSegment.flightNumber,
    stops: String(offer.stops),
    cabin: firstSegment.cabin,
    adults: String(state.adults),
    children: String(state.children),
    refundable: String(offer.refundable),
  })
  if (offer.baggageKg != null) params.set("baggageKg", String(offer.baggageKg))
  return `/vols/book?${params.toString()}`
}

function FlightCard({ offer, state }: { offer: FlightOffer; state: FlightSearchState }) {
  const t = useTranslations("Vols")
  const locale = useLocale()
  const segment = offer.segments[0]
  const href = bookingHref(offer, state)
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
              <span>{offer.stops === 0 ? t("directFlight") : t("stopsCount", { count: offer.stops })}</span>
              {offer.baggageKg != null && (
                <span className="inline-flex items-center gap-1">
                  <Luggage className="h-3 w-3" />
                  {offer.baggageKg} kg
                </span>
              )}
              {offer.refundable && (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                  {t("refundableBadge")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
          <div className="text-right">
            <p className="text-muted-foreground text-xs">{t("startingFrom")}</p>
            <p className="text-primary text-2xl font-bold tabular-nums">
              {offer.priceTnd.toLocaleString(getIntlLocale(locale))} {offer.currency}
            </p>
          </div>
          {/* Virtual Flight Supplier (lib/vols/virtual-supplier/) : offre,
              disponibilité, prix et jeton signé sont réels côté serveur —
              la réservation décrémente un inventaire réel et émet un PNR
              (voir lib/vols/guest-booking-actions.ts). Seul le fournisseur
              lui-même est simulé (pas de GDS Amadeus/Sabre réel en amont),
              pas la réservation. */}
          {href ? (
            <Button size="sm" asChild>
              <Link href={href}>{t("bookButton")}</Link>
            </Button>
          ) : (
            <Button size="sm" disabled>
              {t("offerUnavailable")}
            </Button>
          )}
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
  const t = useTranslations("Vols")
  const locale = useLocale()
  const dateFnsLocale = getDateFnsLocale(locale)
  const paxLabel =
    state.children > 0
      ? t("paxAdultsChildren", { adults: state.adults, children: state.children })
      : t("paxAdultsOnly", { n: state.adults })
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground text-xl font-bold">
            {airportLabel(state.origin)} → {airportLabel(state.destination)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDateHeader(state.departureDate, dateFnsLocale)}
            {state.returnDate ? ` · ${t("returnTrip", { date: formatDateHeader(state.returnDate, dateFnsLocale) })}` : ` · ${t("oneWayTrip")}`}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {paxLabel}
            </span>
            {" · "}
            {t("flightsFoundCount", { count })}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/vols?origin=${state.origin}&destination=${state.destination}&cabin=${state.cabin}&adults=${state.adults}`}>
            {t("modifySearch")}
          </Link>
        </Button>
      </div>
      {isDemo && (
        <div className="border-border bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t("demoNotice")}
          </p>
        </div>
      )}
    </div>
  )
}

export function FlightResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations("Vols")

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
          error: err instanceof Error ? err.message : t("unknownError"),
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
          <p className="font-semibold">{t("incompleteSearchTitle")}</p>
          <p className="mt-1">{parsed.error}</p>
          <Button asChild variant="outline" className="mt-3">
            <Link href="/vols">{t("backToSearch")}</Link>
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
        isDemo={offers.some((o) => o.source === "virtual")}
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
          <p className="font-semibold">{t("serviceUnavailableTitle")}</p>
          <p className="mt-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
            onClick={() => router.replace(`/vols/search?${searchParams.toString()}`)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("retry")}
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
                {t("directOnlyFilter")}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="refundable-only"
                checked={refundableOnly}
                onCheckedChange={(v) => setRefundableOnly(v === true)}
              />
              <label htmlFor="refundable-only" className="cursor-pointer text-sm">
                {t("refundableOnlyFilter")}
              </label>
            </div>
            <div className="w-full lg:mt-2">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommended">{t("sortRecommended")}</SelectItem>
                  <SelectItem value="price_asc">{t("sortPriceAsc")}</SelectItem>
                  <SelectItem value="price_desc">{t("sortPriceDesc")}</SelectItem>
                  <SelectItem value="duration_asc">{t("sortDurationAsc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </aside>

          <div className="flex-1 space-y-3">
            {filteredSorted.length === 0 ? (
              <div className="border-border text-muted-foreground rounded-lg border p-6 text-sm">
                {t("noFlightsMatchFilters")}
              </div>
            ) : (
              filteredSorted.map((offer) => <FlightCard key={offer.id} offer={offer} state={parsed.state} />)
            )}
          </div>
        </div>
      )}
    </main>
  )
}
