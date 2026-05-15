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
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"
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

const tabs = [
  { id: "vols", label: "Vols", icon: Plane },
  { id: "hotels-tunisie", label: "Hôtels Tunisie", icon: Building2 },
  { id: "hotels-monde", label: "Hôtels Monde", icon: Globe },
  { id: "omraty", label: "Omraty", icon: Moon },
  { id: "voyages-organises", label: "Voyages Organisés", icon: Briefcase },
  { id: "transferts", label: "Transferts", icon: Bus },
  { id: "car", label: "Car", icon: Car },
] as const

type TabId = (typeof tabs)[number]["id"]

// Sidi Bou Said — iconic Tunisian Mediterranean coast (white & blue village)
const HERO_BG_URL =
  "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop"

export function BookingEngine() {
  const [activeTab, setActiveTab] = useState<TabId>("vols")

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
            {tabs.map((tab) => {
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
                    {tab.label}
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
            {activeTab === "transferts" && <TransfertsForm />}
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
        router.push(
          buildSampleBookingUrl({
            module: "flight",
            offerLabel: "Vol Tunis → Istanbul A/R — Tunisair",
            unitPriceTnd: 1850,
            startInDays: 21,
            endInDays: 28,
          }),
        )
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Départ de</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input defaultValue="Tunis (TUN)" className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Destination</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input defaultValue="Istanbul (IST)" className="rounded-xl pl-9" />
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
        router.push(
          buildSampleBookingUrl({
            module: "hotel",
            offerLabel: "Hilton Istanbul Bomonti — Suite Deluxe",
            unitPriceTnd: 980,
            startInDays: 30,
            endInDays: 37,
          }),
        )
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

function OmratyForm() {
  const router = useRouter()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        router.push(
          buildSampleBookingUrl({
            module: "omra",
            offerLabel: "Omra Prestige 10 jours — Hôtel 5★ Haram 400m",
            unitPriceTnd: 5400,
            startInDays: 60,
            endInDays: 70,
            adults: 1,
          }),
        )
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Programme</FieldLabel>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">Économique</SelectItem>
              <SelectItem value="confort">Confort</SelectItem>
              <SelectItem value="prestige">Prestige</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Mois de départ</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choisir le mois" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jan">Janvier 2026</SelectItem>
              <SelectItem value="feb">Février 2026</SelectItem>
              <SelectItem value="mar">Mars 2026</SelectItem>
              <SelectItem value="apr">Avril 2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Distance Haram</FieldLabel>
          <Select defaultValue="400">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Distance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="400">400m à pied</SelectItem>
              <SelectItem value="600">600m à pied</SelectItem>
              <SelectItem value="1000">1km à pied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Type de vol</FieldLabel>
          <Select defaultValue="direct">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Type de vol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Vol direct</SelectItem>
              <SelectItem value="escale">Avec escale</SelectItem>
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

function VoyagesOrganisesForm() {
  const router = useRouter()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        router.push(
          buildSampleBookingUrl({
            module: "package",
            offerLabel: "Circuit Turquie 7J — Istanbul / Cappadoce / Pamukkale",
            unitPriceTnd: 3200,
            startInDays: 45,
            endInDays: 52,
          }),
        )
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Destination</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choisir une destination" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="turquie">Turquie</SelectItem>
              <SelectItem value="egypte">Égypte</SelectItem>
              <SelectItem value="dubai">Dubaï</SelectItem>
              <SelectItem value="malaisie">Malaisie</SelectItem>
              <SelectItem value="thailande">Thaïlande</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Période</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Choisir la période"
              className="rounded-xl pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Durée</FieldLabel>
          <Select defaultValue="7">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Durée" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 jours / 2 nuits</SelectItem>
              <SelectItem value="5">5 jours / 4 nuits</SelectItem>
              <SelectItem value="7">7 jours / 6 nuits</SelectItem>
              <SelectItem value="10">10 jours / 9 nuits</SelectItem>
              <SelectItem value="14">14 jours / 13 nuits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Voyageurs</FieldLabel>
          <Select defaultValue="2">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Voyageurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Voyageur</SelectItem>
              <SelectItem value="2">2 Voyageurs</SelectItem>
              <SelectItem value="3">3 Voyageurs</SelectItem>
              <SelectItem value="4">4 Voyageurs</SelectItem>
              <SelectItem value="5">5+ Voyageurs</SelectItem>
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

function TransfertsForm() {
  const router = useRouter()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        router.push(
          buildSampleBookingUrl({
            module: "transfer",
            offerLabel: "Transfert privé Aéroport Tunis → Hammamet — Berline",
            unitPriceTnd: 120,
            startInDays: 14,
            adults: 3,
          }),
        )
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>Lieu de prise en charge</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Aéroport / Port" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tunis-airport">
                Aéroport Tunis-Carthage
              </SelectItem>
              <SelectItem value="enfidha">Aéroport Enfidha</SelectItem>
              <SelectItem value="djerba-airport">Aéroport Djerba</SelectItem>
              <SelectItem value="monastir">Aéroport Monastir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Lieu de dépose</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder="Hôtel ou adresse" className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Date et heure</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder="Date d'arrivée" className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Passagers</FieldLabel>
          <Select defaultValue="2">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Passagers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Passager</SelectItem>
              <SelectItem value="2">2 Passagers</SelectItem>
              <SelectItem value="3">3 Passagers</SelectItem>
              <SelectItem value="4">4 Passagers</SelectItem>
              <SelectItem value="5">5+ Passagers</SelectItem>
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
        router.push(
          buildSampleBookingUrl({
            module: "activity",
            offerLabel: "Location Citadine — 5 jours / kilométrage illimité",
            unitPriceTnd: 90,
            startInDays: 14,
            endInDays: 19,
            adults: 1,
          }),
        )
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
