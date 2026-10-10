"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import {
  Plane,
  Calendar,
  Users,
  ArrowLeftRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DestinationAutocomplete } from "@/components/destination-autocomplete"
import {
  AIRPORTS,
  parseAirportInput,
  parseCabin,
  encodeMultiCityLegs,
  type CabinClass,
  type MultiCityLeg,
} from "@/lib/vols/search-state"

type TripTab = "oneway" | "roundtrip" | "multicity"

function matchAirportCode(input: string | undefined): string {
  const code = parseAirportInput(input)
  return code && AIRPORTS.some((a) => a.code === code) ? code : ""
}

const today = new Date().toISOString().split("T")[0]!

export function FlightSearch({
  initialOrigin,
  initialDestination,
  initialCabin,
  initialAdults,
}: {
  initialOrigin?: string
  initialDestination?: string
  initialCabin?: string
  initialAdults?: string
} = {}) {
  const router = useRouter()
  const t = useTranslations("Vols")
  const locale = useLocale()
  const dateLang =
    locale === "ar" ? "ar-TN" : locale === "fr" ? "fr-FR" : "en-US"
  const [isPending, startTransition] = useTransition()

  const CABIN_CLASSES = [
    { value: "ECONOMY", label: t("cabinEconomy") },
    { value: "PREMIUM_ECONOMY", label: t("cabinPremiumEconomy") },
    { value: "BUSINESS", label: t("cabinBusiness") },
    { value: "FIRST", label: t("cabinFirst") },
  ]

  // ── Shared state ─────────────────────────────────────────────────────────
  const [tripType, setTripType] = useState<TripTab>("oneway")
  const [origin, setOrigin] = useState(
    () => matchAirportCode(initialOrigin) || "TUN",
  )
  const [destination, setDestination] = useState(() =>
    matchAirportCode(initialDestination),
  )
  const [departureDate, setDepartureDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [adults, setAdults] = useState(() =>
    initialAdults && /^[1-9][0-9]?$/.test(initialAdults) ? initialAdults : "1",
  )
  const [children, setChildren] = useState("0")
  const [cabin, setCabin] = useState<CabinClass>(() => parseCabin(initialCabin))

  // ── Multi-city legs ───────────────────────────────────────────────────────
  const [legs, setLegs] = useState<MultiCityLeg[]>([
    {
      origin: matchAirportCode(initialOrigin) || "TUN",
      destination: "",
      departureDate: "",
    },
    { origin: "", destination: "", departureDate: "" },
  ])

  function addLeg() {
    if (legs.length >= 5) return
    const last = legs[legs.length - 1]
    setLegs([
      ...legs,
      { origin: last?.destination ?? "", destination: "", departureDate: "" },
    ])
  }

  function removeLeg(i: number) {
    if (legs.length <= 2) {
      toast.error(t("toastMinLegs"))
      return
    }
    setLegs(legs.filter((_, idx) => idx !== i))
  }

  function updateLeg(i: number, patch: Partial<MultiCityLeg>) {
    setLegs(legs.map((leg, idx) => (idx === i ? { ...leg, ...patch } : leg)))
  }

  // ── Swap ─────────────────────────────────────────────────────────────────
  function swapAirports() {
    const tmp = origin
    setOrigin(destination)
    setDestination(tmp)
  }

  // ── Validate & navigate ───────────────────────────────────────────────────
  function handleSearch() {
    if (tripType === "multicity") {
      for (const [i, leg] of legs.entries()) {
        if (!leg.origin || !leg.destination) {
          toast.error(t("toastSelectAirports"))
          return
        }
        if (leg.origin === leg.destination) {
          toast.error(t("toastLegSameAirports", { n: i + 1 }))
          return
        }
        if (!leg.departureDate) {
          toast.error(t("toastLegDate", { n: i + 1 }))
          return
        }
      }
      const params = new URLSearchParams({
        tripType: "multicity",
        legs: encodeMultiCityLegs(legs),
        adults,
        children,
        cabin,
      })
      startTransition(() => router.push(`/vols/search?${params.toString()}`))
      return
    }

    if (!origin || !destination) {
      toast.error(t("toastSelectAirports"))
      return
    }
    if (origin === destination) {
      toast.error(t("toastSameAirports"))
      return
    }
    if (!departureDate) {
      toast.error(t("toastSelectDepartureDate"))
      return
    }
    if (tripType === "roundtrip") {
      if (!returnDate) {
        toast.error(t("toastSelectReturnDate"))
        return
      }
      if (returnDate < departureDate) {
        toast.error(t("toastReturnBeforeDeparture"))
        return
      }
    }

    const params = new URLSearchParams({
      tripType: tripType === "roundtrip" ? "roundtrip" : "oneway",
      origin,
      destination,
      departureDate,
      adults,
      children,
      cabin,
    })
    if (tripType === "roundtrip" && returnDate)
      params.set("returnDate", returnDate)

    startTransition(() => router.push(`/vols/search?${params.toString()}`))
  }

  return (
    <div className="bg-card rounded-2xl border p-6 shadow-sm">
      {/* Trip type tabs */}
      <Tabs
        value={tripType}
        onValueChange={(v) => setTripType(v as TripTab)}
        className="mb-5"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="oneway">{t("tripOneWay")}</TabsTrigger>
          <TabsTrigger value="roundtrip">{t("tripRoundTrip")}</TabsTrigger>
          <TabsTrigger value="multicity">{t("tripMultiCity")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── One-way / Round-trip ───────────────────────────────────────── */}
      {(tripType === "oneway" || tripType === "roundtrip") && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <DestinationAutocomplete
              module="iata"
              value={origin}
              onChange={setOrigin}
              label={t("departureLabel")}
            />
          </div>

          <div className="relative space-y-2">
            <DestinationAutocomplete
              module="iata"
              value={destination}
              onChange={setDestination}
              label={t("arrivalLabel")}
              excludeExternalId={origin}
            />
            <button
              type="button"
              onClick={swapAirports}
              className="bg-background hover:bg-muted absolute top-1/2 -left-5 z-10 hidden -translate-y-1/2 rounded-full border p-1 shadow-sm transition-colors sm:block rtl:-right-5 rtl:left-auto"
              title={t("swapAria")}
            >
              <ArrowLeftRight className="h-3 w-3 rtl:rotate-180" />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Calendar className="text-muted-foreground h-3.5 w-3.5" />
              {t("departureDateLabel")}
            </Label>
            <Input
              type="date"
              value={departureDate}
              min={today}
              lang={dateLang}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
          </div>

          {tripType === "roundtrip" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Calendar className="text-muted-foreground h-3.5 w-3.5" />
                {t("returnDateLabel")}
              </Label>
              <Input
                type="date"
                value={returnDate}
                min={departureDate || today}
                lang={dateLang}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
          )}

          {/* Passengers */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Users className="text-muted-foreground h-3.5 w-3.5" />
              {t("passengersLabel")}
            </Label>
            <div className="flex gap-2">
              <Select value={adults} onValueChange={setAdults}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t("adultsCountOption", { n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={children} onValueChange={setChildren}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t("childrenCountOption", { n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cabin */}
          <div className="space-y-2">
            <Label className="text-sm">{t("classLabel")}</Label>
            <Select
              value={cabin}
              onValueChange={(v) => setCabin(v as CabinClass)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CABIN_CLASSES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── Multi-city ────────────────────────────────────────────────────── */}
      {tripType === "multicity" && (
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div
              key={i}
              className="rounded-lg border border-dashed border-sky-200 bg-sky-50/40 p-4 dark:border-sky-800 dark:bg-sky-950/20"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-300">
                  {t("multiCityLegTitle", { n: i + 1 })}
                </span>
                {legs.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeLeg(i)}
                    className="text-muted-foreground hover:text-destructive rounded p-1"
                    title={t("removeLeg")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DestinationAutocomplete
                  module="iata"
                  value={leg.origin}
                  onChange={(v) => updateLeg(i, { origin: v })}
                  label={t("departureLabel")}
                />
                <DestinationAutocomplete
                  module="iata"
                  value={leg.destination}
                  onChange={(v) => updateLeg(i, { destination: v })}
                  label={t("arrivalLabel")}
                  excludeExternalId={leg.origin}
                />
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Calendar className="text-muted-foreground h-3.5 w-3.5" />
                    {t("departureDateLabel")}
                  </Label>
                  <Input
                    type="date"
                    value={leg.departureDate}
                    min={i > 0 ? legs[i - 1]?.departureDate || today : today}
                    lang={dateLang}
                    onChange={(e) =>
                      updateLeg(i, { departureDate: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          {legs.length < 5 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLeg}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addLeg")}
            </Button>
          )}

          {/* Passengers + cabin for multicity */}
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm">
                <Users className="text-muted-foreground h-3.5 w-3.5" />
                {t("passengersLabel")}
              </Label>
              <div className="flex gap-2">
                <Select value={adults} onValueChange={setAdults}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {t("adultsCountOption", { n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={children} onValueChange={setChildren}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {t("childrenCountOption", { n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t("classLabel")}</Label>
              <Select
                value={cabin}
                onValueChange={(v) => setCabin(v as CabinClass)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSearch}
          disabled={isPending}
          size="lg"
          className="gap-2 bg-sky-700 hover:bg-sky-800"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plane className="h-4 w-4" />
          )}
          {t("searchButton")}
        </Button>
      </div>
    </div>
  )
}
