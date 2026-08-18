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

import dynamic from "next/dynamic"

import { toast } from "sonner"

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
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e3a5f]/20 via-transparent to-[#1e3a5f]/40" />
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
                      ? "border-[#e5b94e] bg-[#1e3a5f]/5 text-[#1e3a5f]"
                      : "text-muted-foreground hover:bg-muted/50 border-transparent hover:text-[#1e3a5f]"
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const params = new URLSearchParams()
        params.set("origin", (fd.get("origin") as string) || "TUN")
        params.set("destination", (fd.get("destination") as string) || "IST")
        params.set("adults", "1")
        router.push(`/vols?${params.toString()}`)
      }}
      className="space-y-4"
    >
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
          <FieldLabel>Dates</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              placeholder="Choisir les dates"
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Classe</FieldLabel>

          <Select defaultValue="economique">
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
          <Checkbox id="vols-flexible" />

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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        router.push("/hotels-monde")
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <FieldLabel>Destination mondiale</FieldLabel>

          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input
              placeholder="Ville, hôtel ou aéroport"
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Check-in</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input placeholder="Date d'arrivée" className="rounded-xl pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Check-out</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input placeholder="Date de départ" className="rounded-xl pl-9" />
          </div>
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

function CarForm() {
  const router = useRouter()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        router.push("/car")
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Lieu de prise en charge</FieldLabel>

          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Aéroport ou ville" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="tunis-airport">
                Aéroport Tunis-Carthage
              </SelectItem>

              <SelectItem value="enfidha">Aéroport Enfidha</SelectItem>

              <SelectItem value="djerba-airport">Aéroport Djerba</SelectItem>

              <SelectItem value="hammamet">Hammamet centre</SelectItem>

              <SelectItem value="sousse">Sousse centre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Date de prise</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input placeholder="Choisir la date" className="rounded-xl pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Date de retour</FieldLabel>

          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />

            <Input placeholder="Choisir la date" className="rounded-xl pl-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Catégorie</FieldLabel>

          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="economique">Économique</SelectItem>

              <SelectItem value="compacte">Compacte</SelectItem>

              <SelectItem value="berline">Berline</SelectItem>

              <SelectItem value="suv">SUV</SelectItem>

              <SelectItem value="luxe">Luxe</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 pt-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Checkbox id="car-driver" />

          <label
            htmlFor="car-driver"
            className="text-muted-foreground cursor-pointer text-sm"
          >
            Avec chauffeur
          </label>
        </div>

        <SearchSubmit />
      </div>
    </form>
  )
}
