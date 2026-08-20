"use client"

import { useRouter } from "next/navigation"

import { useState } from "react"

import {
  Plane,
  Building2,
  Globe,
  Moon,
  Briefcase,
  Bus,
  Car,
  MapPin,
  CalendarDays,
  Users,
  Plus,
  Minus,
  Clock,
  ArrowLeftRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"

import { Input } from "@/components/ui/input"

import { Checkbox } from "@/components/ui/checkbox"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import dynamic from "next/dynamic"

import { toast } from "sonner"

import { addDays, differenceInCalendarDays, format } from "date-fns"

import type { CatalogTransferZone } from "@/lib/db/schema"

import { useT } from "@/components/locale-context"

const HotelsTunisieSearch = dynamic(
  () =>
    import("@/components/hotels-tunisie-search").then(
      (m) => m.HotelsTunisieSearch,
    ),

  {
    ssr: false,
    loading: () => <div className="bg-muted h-24 animate-pulse rounded-xl" />,
  },
)

import { encodeDraft } from "@/lib/booking/draft-store"

import type { BookingDraft } from "@/lib/booking/schemas"

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function futureDate(days: number): string {
  const d = new Date()

  d.setDate(d.getDate() + days)

  return iso(d)
}

const TODAY_ISO = iso(new Date())
const TOMORROW_ISO = futureDate(1)

function buildSampleBookingUrl(input: {
  module: BookingDraft["module"]

  offerLabel: string

  unitPriceTnd: number

  startInDays?: number

  endInDays?: number

  adults?: number
}): string {
  const token = encodeDraft({
    draft: {
      module: input.module,

      offerId: `demo-${input.module}-${Math.floor(Math.random() * 1e6)}`,

      offerLabel: input.offerLabel,

      startDate: futureDate(input.startInDays ?? 21),

      endDate:
        input.endInDays != null ? futureDate(input.endInDays) : undefined,

      adults: input.adults ?? 2,

      children: 0,

      unitPriceTnd: input.unitPriceTnd,

      currency: "TND",
    },
  })

  return `/booking?d=${encodeURIComponent(token)}`
}

const tabsConfig = [
  { id: "vols", labelKey: "tabVols", icon: Plane },
  { id: "hotels-tunisie", labelKey: "tabHotelsTunisie", icon: Building2 },
  { id: "hotels-monde", labelKey: "tabHotelsMonde", icon: Globe },
  { id: "omraty", labelKey: "tabOmraty", icon: Moon },
  { id: "voyages-organises", labelKey: "tabVoyages", icon: Briefcase },
  { id: "transferts", labelKey: "tabTransferts", icon: Bus },
  { id: "car", labelKey: "tabCar", icon: Car },
] as const

type TabId = (typeof tabsConfig)[number]["id"]

// Sidi Bou Said — iconic Tunisian Mediterranean coast (white & blue village)

const HERO_BG_URL =
  "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop"

export function BookingEngine({
  transferZones = [],
}: {
  transferZones?: CatalogTransferZone[]
}) {
  const [activeTab, setActiveTab] = useState<TabId>("vols")
  const t = useT()

  return (
    <div className="relative">
      {/* Hero Background */}

      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${HERO_BG_URL}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sidebar/20 via-transparent to-sidebar/40" />
      </div>

      {/* Content */}

      <div className="relative mx-auto max-w-5xl px-4 py-12 sm:py-16 lg:py-20">
        <div className="bg-card overflow-hidden rounded-3xl shadow-2xl">
          {/* Tabs */}

          <div className="border-border flex overflow-x-auto border-b">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon

              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-[88px] flex-1 flex-col items-center gap-1.5 border-b-2 px-2 py-4 text-sm font-medium transition-colors sm:px-3 ${
                    isActive
                      ? "border-accent bg-sidebar/5 text-sidebar"
                      : "text-muted-foreground hover:bg-muted/50 border-transparent hover:text-sidebar"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-5" />

                  <span className="text-xs whitespace-nowrap sm:text-sm">
                    {t(tab.labelKey)}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search Form */}

          <div className="p-4 sm:p-6">
            {activeTab === "vols" && <VolsForm />}

            {activeTab === "hotels-tunisie" && <HotelsTunisieSearch />}

            {activeTab === "hotels-monde" && <HotelsMondeForm />}

            {activeTab === "omraty" && <OmratyForm />}

            {activeTab === "voyages-organises" && <VoyagesOrganisesForm />}

            {activeTab === "transferts" && <TransfertsForm zones={transferZones} />}

            {activeTab === "car" && <CarForm />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

// Shared form atoms

// ----------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-muted-foreground text-xs font-medium">
      {children}
    </label>
  )
}

/** Ligne compteur +/- réutilisée par les popovers Voyageurs/Occupants. */
function CounterRow({
  label,
  sublabel,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  sublabel?: string
  min: number
  max: number
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sublabel && (
          <p className="text-muted-foreground text-xs">{sublabel}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 rounded-full"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Diminuer : ${label}`}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-5 text-center text-sm font-medium">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 rounded-full"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Augmenter : ${label}`}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  )
}

/** "3 nuits" / "1 nuit" à partir de deux dates ISO (yyyy-MM-dd). */
function nightsLabel(checkIn: string, checkOut: string): string | null {
  if (!checkIn || !checkOut) return null
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
  if (nights <= 0) return null
  return `${nights} nuit${nights > 1 ? "s" : ""}`
}

/** Ajoute `days` jours à une date ISO (yyyy-MM-dd) et retourne une date ISO. */
function addDaysIso(dateIso: string, days: number): string {
  return format(addDays(new Date(dateIso), days), "yyyy-MM-dd")
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

function SearchSubmit({
  children = "RECHERCHER",
}: {
  children?: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-e2b-soft w-full rounded-2xl px-8 text-base font-semibold transition-shadow hover:shadow-md sm:w-auto"
    >
      {children}
    </Button>
  )
}

// ----------------------------------------------------------------------------

// Per-module forms (visual only — RECHERCHER triggers a toast)

// ----------------------------------------------------------------------------

function VolsForm() {
  const router = useRouter()
  const [tripType, setTripType] = useState<"roundtrip" | "oneway">("roundtrip")
  const [travelClass, setTravelClass] = useState("economique")
  const [flexible, setFlexible] = useState(false)
  const [departureDate, setDepartureDate] = useState(TODAY_ISO)
  const [returnDate, setReturnDate] = useState(TOMORROW_ISO)
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [babies, setBabies] = useState(0)
  const [paxOpen, setPaxOpen] = useState(false)

  const paxSummary = [
    `${adults} adulte${adults > 1 ? "s" : ""}`,
    children > 0 ? `${children} enfant${children > 1 ? "s" : ""}` : null,
    babies > 0 ? `${babies} bébé${babies > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const origin = ((fd.get("origin") as string) || "Tunis (TUN)").trim()
        const destination = (
          (fd.get("destination") as string) || "Istanbul (IST)"
        ).trim()

        if (origin.toLowerCase() === destination.toLowerCase()) {
          toast.error(
            "L'aéroport de départ et d'arrivée doivent être différents.",
          )
          return
        }
        if (tripType === "roundtrip" && returnDate < departureDate) {
          toast.error("La date de retour doit être après la date de départ.")
          return
        }

        const params = new URLSearchParams()
        params.set("origin", origin)
        params.set("destination", destination)
        params.set("tripType", tripType)
        params.set("departureDate", departureDate)
        if (tripType === "roundtrip") params.set("returnDate", returnDate)
        params.set("class", travelClass)
        params.set("adults", String(adults))
        if (children > 0) params.set("children", String(children))
        if (babies > 0) params.set("babies", String(babies))
        if (flexible) params.set("flexible", "1")
        router.push(`/vols?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <Tabs
        value={tripType}
        onValueChange={(v) => {
          const next = v as "roundtrip" | "oneway"
          setTripType(next)
          if (next === "roundtrip" && returnDate < departureDate) {
            setReturnDate(departureDate)
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="roundtrip" className="gap-1.5">
            <ArrowLeftRight className="size-3.5" />
            Aller-retour
          </TabsTrigger>
          <TabsTrigger value="oneway">Aller simple</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Départ de</FieldLabel>

          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input name="origin" defaultValue="Tunis (TUN)" className="rounded-xl pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Destination</FieldLabel>

          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input name="destination" defaultValue="Istanbul (IST)" className="rounded-xl pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Date de départ</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              type="date"
              value={departureDate}
              min={TODAY_ISO}
              onChange={(e) => {
                setDepartureDate(e.target.value)
                if (tripType === "roundtrip" && returnDate < e.target.value) {
                  setReturnDate(e.target.value)
                }
              }}
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Date de retour</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              type="date"
              value={returnDate}
              min={departureDate}
              disabled={tripType === "oneway"}
              onChange={(e) => setReturnDate(e.target.value)}
              className="rounded-xl pl-9 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Passagers</FieldLabel>

          <Popover open={paxOpen} onOpenChange={setPaxOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-start rounded-xl px-3 font-normal"
              >
                <Users className="text-muted-foreground mr-2 size-4 shrink-0" />
                <span className="truncate">{paxSummary}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-4" align="start">
              <CounterRow
                label="Adultes"
                sublabel="12 ans et plus"
                min={1}
                max={9}
                value={adults}
                onChange={(n) => {
                  setAdults(n)
                  if (babies > n) setBabies(n)
                }}
              />
              <CounterRow
                label="Enfants"
                sublabel="2-11 ans, siège occupé"
                min={0}
                max={8}
                value={children}
                onChange={setChildren}
              />
              <CounterRow
                label="Bébés"
                sublabel="0-2 ans, sur les genoux"
                min={0}
                max={adults}
                value={babies}
                onChange={setBabies}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Classe</FieldLabel>

          <Select value={travelClass} onValueChange={setTravelClass}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Classe" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="economique">Économique</SelectItem>

              <SelectItem value="premium">Premium</SelectItem>

              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 pt-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Checkbox
            id="vols-flexible"
            checked={flexible}
            onCheckedChange={(v) => setFlexible(v === true)}
          />

          <label
            htmlFor="vols-flexible"
            className="text-muted-foreground cursor-pointer text-sm"
          >
            Comparer avec les prix flexibles
          </label>
        </div>

        <SearchSubmit />
      </div>
    </form>
  )
}

function HotelsMondeForm() {
  const router = useRouter()
  const [checkIn, setCheckIn] = useState(TODAY_ISO)
  const [checkOut, setCheckOut] = useState(TOMORROW_ISO)
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [babies, setBabies] = useState(0)
  const [occupancyOpen, setOccupancyOpen] = useState(false)

  const nights = nightsLabel(checkIn, checkOut)
  const occupancySummary = [
    `${rooms} chambre${rooms > 1 ? "s" : ""}`,
    `${adults} adulte${adults > 1 ? "s" : ""}`,
    children > 0 ? `${children} enfant${children > 1 ? "s" : ""}` : null,
    babies > 0 ? `${babies} bébé${babies > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const destination = (fd.get("destination") as string)?.trim()

        if (checkOut <= checkIn) {
          toast.error(
            "La date de départ doit être après la date d'arrivée (1 nuit minimum).",
          )
          return
        }

        const params = new URLSearchParams()
        if (destination) params.set("destination", destination)
        params.set("checkin", checkIn)
        params.set("checkout", checkOut)
        params.set("rooms", String(rooms))
        params.set("adults", String(adults))
        if (children > 0) params.set("children", String(children))
        if (babies > 0) params.set("babies", String(babies))
        router.push(`/hotels-monde?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <FieldLabel>Destination mondiale</FieldLabel>

          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              name="destination"
              placeholder="Ville, hôtel ou aéroport"
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Arrivée</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              type="date"
              value={checkIn}
              min={TODAY_ISO}
              onChange={(e) => {
                setCheckIn(e.target.value)
                if (checkOut <= e.target.value) {
                  setCheckOut(addDaysIso(e.target.value, 1))
                }
              }}
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>
            Départ{nights ? <span className="text-primary"> · {nights}</span> : null}
          </FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              type="date"
              value={checkOut}
              min={checkIn ? addDaysIso(checkIn, 1) : TOMORROW_ISO}
              onChange={(e) => setCheckOut(e.target.value)}
              className="rounded-xl pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:w-1/2">
        <div className="space-y-1.5">
          <FieldLabel>Chambres et voyageurs</FieldLabel>

          <Popover open={occupancyOpen} onOpenChange={setOccupancyOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-start rounded-xl px-3 font-normal"
              >
                <Users className="text-muted-foreground mr-2 size-4 shrink-0" />
                <span className="truncate">{occupancySummary}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-4" align="start">
              <CounterRow
                label="Chambres"
                min={1}
                max={8}
                value={rooms}
                onChange={setRooms}
              />
              <CounterRow
                label="Adultes"
                sublabel="18 ans et plus"
                min={1}
                max={16}
                value={adults}
                onChange={setAdults}
              />
              <CounterRow
                label="Enfants"
                sublabel="3-11 ans"
                min={0}
                max={8}
                value={children}
                onChange={setChildren}
              />
              <CounterRow
                label="Bébés"
                sublabel="0-2 ans"
                min={0}
                max={8}
                value={babies}
                onChange={setBabies}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <SearchSubmit />
      </div>
    </form>
  )
}

// Doit correspondre à l'enum omra_package_type réel (lib/db/schema/omra.ts)
// pour que le filtre passé à /omra matche de vrais packages.
const OMRA_PROGRAMMES = [
  { value: "omra", label: "Omra" },
  { value: "ramadan", label: "Omra Ramadan" },
  { value: "umrah_plus", label: "Omra + Ziarat étendu" },
  { value: "hajj", label: "Hajj" },
]

const OMRA_MONTHS = [
  { value: "1", label: "Janvier" },
  { value: "2", label: "Février" },
  { value: "3", label: "Mars" },
  { value: "4", label: "Avril" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Juin" },
  { value: "7", label: "Juillet" },
  { value: "8", label: "Août" },
  { value: "9", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
]

function OmratyForm() {
  const router = useRouter()
  const [programme, setProgramme] = useState("")
  const [month, setMonth] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const params = new URLSearchParams()
        if (programme) params.set("programme", programme)
        if (month) params.set("month", month)
        router.push(`/omra?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Programme</FieldLabel>

          <Select value={programme} onValueChange={setProgramme}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Tous programmes" />
            </SelectTrigger>

            <SelectContent>
              {OMRA_PROGRAMMES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Mois de départ</FieldLabel>

          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Tous les mois" />
            </SelectTrigger>

            <SelectContent>
              {OMRA_MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <SearchSubmit />
      </div>
    </form>
  )
}

// Doit correspondre aux clés DESTINATION_SEARCH_TERMS de app/packages/page.tsx
// (recherche par ILIKE sur le titre — pas de colonne destination dédiée).
const PACKAGE_DESTINATIONS = [
  { value: "istanbul", label: "Istanbul" },
  { value: "dubai", label: "Dubaï" },
  { value: "paris", label: "Paris" },
  { value: "rome", label: "Rome" },
  { value: "barcelona", label: "Barcelone" },
  { value: "london", label: "Londres" },
  { value: "cairo", label: "Le Caire" },
  { value: "casablanca", label: "Casablanca" },
]

// Doit correspondre aux plages lues par parseDurationRange() dans
// app/packages/page.tsx.
const PACKAGE_DURATIONS = [
  { value: "3-5", label: "3 à 5 jours" },
  { value: "6-8", label: "6 à 8 jours" },
  { value: "9-12", label: "9 à 12 jours" },
  { value: "13+", label: "13 jours et plus" },
]

function VoyagesOrganisesForm() {
  const router = useRouter()
  const [destination, setDestination] = useState("")
  const [duration, setDuration] = useState("")
  const [travelers, setTravelers] = useState("2")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const params = new URLSearchParams()
        if (destination) params.set("destination", destination)
        if (duration) params.set("duration", duration)
        if (travelers) params.set("travelers", travelers)
        router.push(`/packages?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel>Destination</FieldLabel>

          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Toutes destinations" />
            </SelectTrigger>

            <SelectContent>
              {PACKAGE_DESTINATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Durée</FieldLabel>

          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Toutes durées" />
            </SelectTrigger>

            <SelectContent>
              {PACKAGE_DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Voyageurs</FieldLabel>

          <Select value={travelers} onValueChange={setTravelers}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Voyageurs" />
            </SelectTrigger>

            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} Voyageur{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <SearchSubmit />
      </div>
    </form>
  )
}

/** Heure de prise en charge par défaut pour la recherche rapide (affinable sur /transferts/resultats). */
const TRANSFER_DEFAULT_TIME = "10:00"
const TRANSFER_DEFAULT_VEHICLE = "sedan"

function TransfertsForm({ zones }: { zones: CatalogTransferZone[] }) {
  const router = useRouter()
  const [fromZone, setFromZone] = useState("")
  const [toZone, setToZone] = useState("")
  const [date, setDate] = useState("")
  const [pax, setPax] = useState("2")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!fromZone || !toZone) {
          toast.error("Veuillez sélectionner le lieu de prise en charge et de dépose.")
          return
        }
        if (!date) {
          toast.error("Veuillez sélectionner une date.")
          return
        }
        if (fromZone === toZone) {
          toast.error("Le lieu de départ et d'arrivée doivent être différents.")
          return
        }
        const params = new URLSearchParams({
          from: fromZone,
          to: toZone,
          vehicle: TRANSFER_DEFAULT_VEHICLE,
          date,
          time: TRANSFER_DEFAULT_TIME,
          pax,
        })
        router.push(`/transferts/resultats?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Lieu de prise en charge</FieldLabel>

          <Select value={fromZone} onValueChange={setFromZone}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>

            <SelectContent>
              {zones.length === 0 ? (
                <SelectItem value="_" disabled>
                  Aucune zone disponible
                </SelectItem>
              ) : (
                zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Lieu de dépose</FieldLabel>

          <Select value={toZone} onValueChange={setToZone}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choisir une zone" />
            </SelectTrigger>

            <SelectContent>
              {zones
                .filter((z) => z.id !== fromZone)
                .map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Date</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              type="date"
              value={date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Passagers</FieldLabel>

          <Select value={pax} onValueChange={setPax}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Passagers" />
            </SelectTrigger>

            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} Passager{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <SearchSubmit />
      </div>
    </form>
  )
}

const CAR_LOCATIONS = [
  { value: "tunis-airport", label: "Aéroport Tunis-Carthage" },
  { value: "enfidha", label: "Aéroport Enfidha" },
  { value: "djerba-airport", label: "Aéroport Djerba" },
  { value: "hammamet", label: "Hammamet centre" },
  { value: "sousse", label: "Sousse centre" },
]

const CAR_CATEGORIES = [
  { value: "economique", label: "Économique" },
  { value: "compacte", label: "Compacte" },
  { value: "berline", label: "Berline" },
  { value: "suv", label: "SUV" },
  { value: "luxe", label: "Luxe" },
]

function CarForm() {
  const router = useRouter()
  const [location, setLocation] = useState("")
  const [pickupDate, setPickupDate] = useState(TODAY_ISO)
  const [pickupTime, setPickupTime] = useState("10:00")
  const [returnDate, setReturnDate] = useState(TOMORROW_ISO)
  const [returnTime, setReturnTime] = useState("10:00")
  const [category, setCategory] = useState("economique")
  const [withDriver, setWithDriver] = useState(false)
  const [differentReturn, setDifferentReturn] = useState(false)
  const [returnLocation, setReturnLocation] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()

        if (!location) {
          toast.error("Veuillez sélectionner un lieu de prise en charge.")
          return
        }
        if (differentReturn && !returnLocation) {
          toast.error("Veuillez sélectionner un lieu de restitution.")
          return
        }
        const pickupAt = new Date(`${pickupDate}T${pickupTime}`)
        const returnAt = new Date(`${returnDate}T${returnTime}`)
        if (returnAt <= pickupAt) {
          toast.error(
            "La restitution doit avoir lieu après la prise en charge (24h minimum recommandées).",
          )
          return
        }

        const params = new URLSearchParams()
        params.set("location", location)
        params.set("pickupDate", pickupDate)
        params.set("pickupTime", pickupTime)
        params.set("returnDate", returnDate)
        params.set("returnTime", returnTime)
        params.set("category", category)
        if (withDriver) params.set("driver", "1")
        if (differentReturn && returnLocation) {
          params.set("differentReturn", "1")
          params.set("returnLocation", returnLocation)
        }
        router.push(`/car?${params.toString()}`)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Lieu de prise en charge</FieldLabel>

          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Aéroport ou ville" />
            </SelectTrigger>

            <SelectContent>
              {CAR_LOCATIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {differentReturn && (
          <div className="space-y-1.5">
            <FieldLabel>Lieu de restitution</FieldLabel>

            <Select value={returnLocation} onValueChange={setReturnLocation}>
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue placeholder="Aéroport ou ville" />
              </SelectTrigger>

              <SelectContent>
                {CAR_LOCATIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel>Prise en charge</FieldLabel>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

              <Input
                type="date"
                value={pickupDate}
                min={TODAY_ISO}
                onChange={(e) => {
                  setPickupDate(e.target.value)
                  if (returnDate < e.target.value) {
                    setReturnDate(e.target.value)
                  }
                }}
                className="rounded-xl pl-9"
              />
            </div>

            <Select value={pickupTime} onValueChange={setPickupTime}>
              <SelectTrigger className="w-28 rounded-xl">
                <Clock className="text-muted-foreground size-3.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Restitution</FieldLabel>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />

              <Input
                type="date"
                value={returnDate}
                min={pickupDate || TODAY_ISO}
                onChange={(e) => setReturnDate(e.target.value)}
                className="rounded-xl pl-9"
              />
            </div>

            <Select value={returnTime} onValueChange={setReturnTime}>
              <SelectTrigger className="w-28 rounded-xl">
                <Clock className="text-muted-foreground size-3.5 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Catégorie</FieldLabel>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>

            <SelectContent>
              {CAR_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="car-different-return"
              checked={differentReturn}
              onCheckedChange={(v) => {
                const next = v === true
                setDifferentReturn(next)
                if (!next) setReturnLocation("")
              }}
            />

            <label
              htmlFor="car-different-return"
              className="text-muted-foreground cursor-pointer text-sm"
            >
              Restituer à une agence différente
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="car-driver"
              checked={withDriver}
              onCheckedChange={(v) => setWithDriver(v === true)}
            />

            <label
              htmlFor="car-driver"
              className="text-muted-foreground cursor-pointer text-sm"
            >
              Avec chauffeur
            </label>
          </div>
        </div>

        <SearchSubmit />
      </div>
    </form>
  )
}
