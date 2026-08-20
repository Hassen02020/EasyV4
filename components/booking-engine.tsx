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
  Search,
  Sparkles,
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

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

import dynamic from "next/dynamic"

import { toast } from "sonner"

import { addDays, differenceInCalendarDays, format } from "date-fns"

import type { CatalogTransferZone } from "@/lib/db/schema"

import { useT } from "@/components/locale-context"

import { cn } from "@/lib/utils"

import { FIELD_SHELL, FIELD_INPUT_RESET, FieldLabel } from "@/components/search-field"

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

/** Rend le formulaire du module actif — partagé par la carte flottante desktop et le bottom-sheet mobile. */
function ActiveModuleForm({
  activeTab,
  transferZones,
}: {
  activeTab: TabId
  transferZones: CatalogTransferZone[]
}) {
  switch (activeTab) {
    case "vols":
      return <VolsForm />
    case "hotels-tunisie":
      return <HotelsTunisieSearch />
    case "hotels-monde":
      return <HotelsMondeForm />
    case "omraty":
      return <OmratyForm />
    case "voyages-organises":
      return <VoyagesOrganisesForm />
    case "transferts":
      return <TransfertsForm zones={transferZones} />
    case "car":
      return <CarForm />
  }
}

/** Segmented control en pilules — module actif = dégradé corail → or. */
function TabPills({
  activeTab,
  onSelect,
  className,
}: {
  activeTab: TabId
  onSelect: (id: TabId) => void
  className?: string
}) {
  const t = useT()

  return (
    <div
      className={cn(
        "no-scrollbar flex gap-1.5 overflow-x-auto scroll-smooth",
        className,
      )}
    >
      {tabsConfig.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all duration-200",
              isActive
                ? "from-primary to-accent shadow-primary/25 bg-gradient-to-r text-white shadow-lg"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}

export function BookingEngine({
  transferZones = [],
}: {
  transferZones?: CatalogTransferZone[]
}) {
  const [activeTab, setActiveTab] = useState<TabId>("vols")
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useT()

  const activeTabConfig = tabsConfig.find((tab) => tab.id === activeTab)!
  const ActiveIcon = activeTabConfig.icon

  return (
    <div className="relative overflow-hidden">
      {/* Hero background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${HERO_BG_URL}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sidebar/85 via-sidebar/35 to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-8 sm:px-6 sm:pt-24 sm:pb-10 lg:pt-28 lg:pb-14">
        {/* Headline */}
        <div className="e2b-fade-in-up mb-8 max-w-2xl sm:mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <Sparkles className="text-accent size-3.5" />
            Réservation instantanée · 100% Tunisie
          </span>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
            Votre prochain voyage
            <br />
            <span className="text-accent">commence ici</span>
          </h1>

          <p className="mt-3 max-w-md text-base text-white/85 sm:text-lg">
            Vols, hôtels, Omra, transferts et location — comparez et réservez
            en toute confiance.
          </p>
        </div>

        {/* Desktop / tablet : carte flottante en glassmorphism */}
        <div
          className="e2b-fade-in-up hidden rounded-[1.75rem] border border-white/40 bg-white/90 p-2.5 shadow-e2b-elevated backdrop-blur-2xl lg:block"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex items-center justify-between gap-3 px-1.5 pt-1.5 pb-2">
            <TabPills activeTab={activeTab} onSelect={setActiveTab} />
          </div>

          <div className="rounded-[1.4rem] bg-white/60 p-5 sm:p-6">
            <ActiveModuleForm
              activeTab={activeTab}
              transferZones={transferZones}
            />
          </div>
        </div>

        {/* Mobile / tablet étroite : déclencheur compact → bottom-sheet */}
        <div className="lg:hidden">
          <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
            <DrawerTrigger asChild>
              <button
                type="button"
                className="shadow-e2b-elevated flex w-full items-center gap-3 rounded-2xl border border-white/40 bg-white/95 px-4 py-3.5 text-left backdrop-blur-xl transition-transform active:scale-[0.99]"
              >
                <span className="from-primary to-accent flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md">
                  <ActiveIcon className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-sm font-semibold">
                    {t(activeTabConfig.labelKey)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    Destination, dates, voyageurs…
                  </span>
                </span>

                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Search className="size-4" />
                </span>
              </button>
            </DrawerTrigger>

            <DrawerContent className="max-h-[92vh] rounded-t-[1.75rem]">
              <DrawerTitle className="sr-only">
                Recherche — {t(activeTabConfig.labelKey)}
              </DrawerTitle>

              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 pt-1 pb-3">
                <TabPills
                  activeTab={activeTab}
                  onSelect={setActiveTab}
                  className="flex-1"
                />
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground shrink-0 rounded-full"
                  >
                    Fermer
                  </Button>
                </DrawerClose>
              </div>

              <div
                className="overflow-y-auto px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                onClickCapture={(e) => {
                  // Un submit réussi navigue (router.push) — on referme le
                  // tiroir dès la soumission plutôt que d'attendre le
                  // démontage de la page, pour un retour visuel immédiat.
                  const target = e.target as HTMLElement
                  if (target.closest('button[type="submit"]')) {
                    window.setTimeout(() => setMobileOpen(false), 50)
                  }
                }}
              >
                <ActiveModuleForm
                  activeTab={activeTab}
                  transferZones={transferZones}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

// Shared form atoms

// ----------------------------------------------------------------------------

// FIELD_SHELL / FIELD_INPUT_RESET / FieldLabel : voir components/search-field.tsx
// (partagé avec HotelsTunisieSearch, extrait pour éviter un import circulaire —
// ce fichier importe HotelsTunisieSearch dynamiquement plus haut).

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
        <p className="text-sm font-semibold">{label}</p>
        {sublabel && (
          <p className="text-muted-foreground text-xs">{sublabel}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="hover:border-primary hover:text-primary size-8 rounded-full"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Diminuer : ${label}`}
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="hover:border-primary hover:text-primary size-8 rounded-full"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Augmenter : ${label}`}
        >
          <Plus className="size-3.5" />
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
  children = "Rechercher",
}: {
  children?: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="from-primary to-accent hover:shadow-primary/30 w-full gap-2 rounded-2xl bg-gradient-to-r px-8 text-base font-semibold text-white uppercase shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 sm:w-auto"
    >
      <Search className="size-4" />
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
      className="space-y-5"
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
        <TabsList className="bg-muted/70 h-10 rounded-full p-1">
          <TabsTrigger
            value="roundtrip"
            className="gap-1.5 rounded-full data-[state=active]:shadow-sm"
          >
            <ArrowLeftRight className="size-3.5" />
            Aller-retour
          </TabsTrigger>
          <TabsTrigger value="oneway" className="rounded-full data-[state=active]:shadow-sm">
            Aller simple
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Départ de</FieldLabel>
          <Input
            name="origin"
            defaultValue="Tunis (TUN)"
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Destination</FieldLabel>
          <Input
            name="destination"
            defaultValue="Istanbul (IST)"
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Date de départ</FieldLabel>
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
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div
          className={cn(
            FIELD_SHELL,
            tripType === "oneway" && "opacity-50",
          )}
        >
          <FieldLabel icon={CalendarDays}>Date de retour</FieldLabel>
          <Input
            type="date"
            value={returnDate}
            min={departureDate}
            disabled={tripType === "oneway"}
            onChange={(e) => setReturnDate(e.target.value)}
            className={FIELD_INPUT_RESET}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Popover open={paxOpen} onOpenChange={setPaxOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={FIELD_SHELL}>
              <FieldLabel icon={Users}>Passagers</FieldLabel>
              <span className="truncate text-sm font-semibold">
                {paxSummary}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-72 space-y-4 rounded-2xl p-5 shadow-e2b-elevated"
            align="start"
          >
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Briefcase}>Classe</FieldLabel>
          <Select value={travelClass} onValueChange={setTravelClass}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

      <div className="flex flex-col items-start justify-between gap-4 pt-1 sm:flex-row sm:items-center">
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
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn(FIELD_SHELL, "lg:col-span-2")}>
          <FieldLabel icon={MapPin}>Destination mondiale</FieldLabel>
          <Input
            name="destination"
            placeholder="Ville, hôtel ou aéroport"
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Arrivée</FieldLabel>
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
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>
            Départ{nights ? <span className="text-primary normal-case"> · {nights}</span> : null}
          </FieldLabel>
          <Input
            type="date"
            value={checkOut}
            min={checkIn ? addDaysIso(checkIn, 1) : TOMORROW_ISO}
            onChange={(e) => setCheckOut(e.target.value)}
            className={FIELD_INPUT_RESET}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:w-1/2">
        <Popover open={occupancyOpen} onOpenChange={setOccupancyOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={FIELD_SHELL}>
              <FieldLabel icon={Users}>Chambres et voyageurs</FieldLabel>
              <span className="truncate text-sm font-semibold">
                {occupancySummary}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-72 space-y-4 rounded-2xl p-5 shadow-e2b-elevated"
            align="start"
          >
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

      <div className="flex justify-end pt-1">
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
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className={FIELD_SHELL}>
          <FieldLabel icon={Moon}>Programme</FieldLabel>
          <Select value={programme} onValueChange={setProgramme}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Mois de départ</FieldLabel>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

      <div className="flex justify-end pt-1">
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
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Destination</FieldLabel>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Clock}>Durée</FieldLabel>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Users}>Voyageurs</FieldLabel>
          <Select value={travelers} onValueChange={setTravelers}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

      <div className="flex justify-end pt-1">
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
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Lieu de prise en charge</FieldLabel>
          <Select value={fromZone} onValueChange={setFromZone}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Lieu de dépose</FieldLabel>
          <Select value={toZone} onValueChange={setToZone}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Date</FieldLabel>
          <Input
            type="date"
            value={date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD_INPUT_RESET}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Users}>Passagers</FieldLabel>
          <Select value={pax} onValueChange={setPax}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

      <div className="flex justify-end pt-1">
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
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className={FIELD_SHELL}>
          <FieldLabel icon={MapPin}>Lieu de prise en charge</FieldLabel>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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
          <div className={FIELD_SHELL}>
            <FieldLabel icon={MapPin}>Lieu de restitution</FieldLabel>
            <Select value={returnLocation} onValueChange={setReturnLocation}>
              <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Prise en charge</FieldLabel>
          <div className="flex items-center gap-2">
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
              className={cn(FIELD_INPUT_RESET, "min-w-0 flex-1")}
            />

            <Select value={pickupTime} onValueChange={setPickupTime}>
              <SelectTrigger className="border-border/60 h-auto w-24 shrink-0 gap-1 rounded-lg border bg-white px-2 py-1 text-xs shadow-none">
                <Clock className="text-muted-foreground size-3 shrink-0" />
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>Restitution</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={returnDate}
              min={pickupDate || TODAY_ISO}
              onChange={(e) => setReturnDate(e.target.value)}
              className={cn(FIELD_INPUT_RESET, "min-w-0 flex-1")}
            />

            <Select value={returnTime} onValueChange={setReturnTime}>
              <SelectTrigger className="border-border/60 h-auto w-24 shrink-0 gap-1 rounded-lg border bg-white px-2 py-1 text-xs shadow-none">
                <Clock className="text-muted-foreground size-3 shrink-0" />
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

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Car}>Catégorie</FieldLabel>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
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

      <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
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
