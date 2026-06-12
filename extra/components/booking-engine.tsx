"use client"

import { useState } from "react"
import { toast } from "sonner"
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
import { useLanguageCurrency } from "@/lib/i18n/LanguageCurrencyContext"

function notifyComingSoon(module: string, t: (key: string) => string) {
  try {
    toast.info(t("booking_engine.coming_soon").replace("{module}", module), {
      description: t("booking_engine.coming_soon_desc"),
    })
  } catch (error) {
    console.error("Toast error:", error)
  }
}

// Sidi Bou Said — iconic Tunisian Mediterranean coast (white & blue village)
const HERO_BG_URL =
  "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop"

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
  children,
}: {
  children?: React.ReactNode
}) {
  const { t } = useLanguageCurrency()
  return (
    <Button
      type="submit"
      className="w-full rounded-xl bg-orange-500 px-8 text-base font-semibold hover:bg-orange-600 sm:w-auto"
    >
      {children || t("booking_engine.search")}
    </Button>
  )
}

function VolsForm() {
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.vols"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.vols.departure")}</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input defaultValue="Tunis (TUN)" className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.vols.destination")}</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input defaultValue="Istanbul (IST)" className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.vols.dates")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={t("booking_engine.vols.choose_dates")}
              className="rounded-xl pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.vols.class")}</FieldLabel>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.vols.class")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">{t("booking_engine.vols.economique")}</SelectItem>
              <SelectItem value="premium">{t("booking_engine.vols.premium")}</SelectItem>
              <SelectItem value="business">{t("booking_engine.vols.business")}</SelectItem>
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
            {t("booking_engine.vols.flexible")}
          </label>
        </div>
        <SearchSubmit />
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// Per-module forms (visual only — RECHERCHER triggers a toast)
// ----------------------------------------------------------------------------

function HotelsMondeForm() {
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.hotels_monde"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <FieldLabel>{t("booking_engine.hotels_monde.destination")}</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={t("booking_engine.hotels_monde.placeholder")}
              className="rounded-xl pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.hotels_monde.checkin")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.hotels_monde.arrival_date")} className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.hotels_monde.checkout")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.hotels_monde.departure_date")} className="rounded-xl pl-9" />
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
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.omraty"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.omraty.program")}</FieldLabel>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.omraty.select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">{t("booking_engine.omraty.economique")}</SelectItem>
              <SelectItem value="confort">{t("booking_engine.omraty.confort")}</SelectItem>
              <SelectItem value="prestige">{t("booking_engine.omraty.prestige")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.omraty.departure_month")}</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.omraty.choose_month")} />
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
          <FieldLabel>{t("booking_engine.omraty.distance_haram")}</FieldLabel>
          <Select defaultValue="400">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.omraty.distance")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="400">400m à pied</SelectItem>
              <SelectItem value="600">600m à pied</SelectItem>
              <SelectItem value="1000">1km à pied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.omraty.flight_type")}</FieldLabel>
          <Select defaultValue="direct">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.omraty.flight_type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">{t("booking_engine.omraty.direct")}</SelectItem>
              <SelectItem value="escale">{t("booking_engine.omraty.with_stopover")}</SelectItem>
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

// ----------------------------------------------------------------------------

function VoyagesOrganisesForm() {
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.voyages_organises"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.voyages_organises.destination")}</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.voyages_organises.choose_destination")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="turquie">{t("booking_engine.voyages_organises.turquie")}</SelectItem>
              <SelectItem value="egypte">{t("booking_engine.voyages_organises.egypte")}</SelectItem>
              <SelectItem value="dubai">{t("booking_engine.voyages_organises.dubai")}</SelectItem>
              <SelectItem value="malaisie">{t("booking_engine.voyages_organises.malaisie")}</SelectItem>
              <SelectItem value="thailande">{t("booking_engine.voyages_organises.thailande")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.voyages_organises.period")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder={t("booking_engine.voyages_organises.choose_period")}
              className="rounded-xl pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.voyages_organises.duration")}</FieldLabel>
          <Select defaultValue="7">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.voyages_organises.duration")} />
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
          <FieldLabel>{t("booking_engine.voyages_organises.travelers")}</FieldLabel>
          <Select defaultValue="2">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.voyages_organises.travelers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("booking_engine.voyages_organises.1_traveler")}</SelectItem>
              <SelectItem value="2">{t("booking_engine.voyages_organises.2_travelers")}</SelectItem>
              <SelectItem value="3">{t("booking_engine.voyages_organises.3_travelers")}</SelectItem>
              <SelectItem value="4">{t("booking_engine.voyages_organises.4_travelers")}</SelectItem>
              <SelectItem value="5">{t("booking_engine.voyages_organises.5_plus_travelers")}</SelectItem>
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
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.transfers"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.transfers.pickup_location")}</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.transfers.airport_port")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tunis-airport">
                {t("booking_engine.transfers.tunis_airport")}
              </SelectItem>
              <SelectItem value="enfidha">{t("booking_engine.transfers.enfidha_airport")}</SelectItem>
              <SelectItem value="djerba-airport">{t("booking_engine.transfers.djerba_airport")}</SelectItem>
              <SelectItem value="monastir">{t("booking_engine.transfers.monastir_airport")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.transfers.dropoff_location")}</FieldLabel>
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.transfers.hotel_address")} className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.transfers.date_time")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.transfers.arrival_date")} className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.transfers.passengers")}</FieldLabel>
          <Select defaultValue="2">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.transfers.passengers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("booking_engine.transfers.1_passenger")}</SelectItem>
              <SelectItem value="2">{t("booking_engine.transfers.2_passengers")}</SelectItem>
              <SelectItem value="3">{t("booking_engine.transfers.3_passengers")}</SelectItem>
              <SelectItem value="4">{t("booking_engine.transfers.4_passengers")}</SelectItem>
              <SelectItem value="5">{t("booking_engine.transfers.5_plus_passengers")}</SelectItem>
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
  const { t } = useLanguageCurrency()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        notifyComingSoon(t("booking_engine.tabs.car"), t)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.car.pickup_location")}</FieldLabel>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.car.airport_city")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tunis-airport">
                {t("booking_engine.transfers.tunis_airport")}
              </SelectItem>
              <SelectItem value="enfidha">{t("booking_engine.transfers.enfidha_airport")}</SelectItem>
              <SelectItem value="djerba-airport">{t("booking_engine.transfers.djerba_airport")}</SelectItem>
              <SelectItem value="hammamet">{t("booking_engine.car.hammamet_center")}</SelectItem>
              <SelectItem value="sousse">{t("booking_engine.car.sousse_center")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.car.pickup_date")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.car.choose_date")} className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.car.return_date")}</FieldLabel>
          <div className="relative">
            <CalendarDays className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input placeholder={t("booking_engine.car.choose_date")} className="rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("booking_engine.car.category")}</FieldLabel>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder={t("booking_engine.car.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">{t("booking_engine.car.economique")}</SelectItem>
              <SelectItem value="compacte">{t("booking_engine.car.compact")}</SelectItem>
              <SelectItem value="berline">{t("booking_engine.car.sedan")}</SelectItem>
              <SelectItem value="suv">{t("booking_engine.car.suv")}</SelectItem>
              <SelectItem value="luxe">{t("booking_engine.car.luxury")}</SelectItem>
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
            {t("booking_engine.car.with_driver")}
          </label>
        </div>
        <SearchSubmit />
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// Main Booking Engine Component
// ----------------------------------------------------------------------------

type TabId = "vols" | "hotels-tunisie" | "hotels-monde" | "omraty" | "voyages-organises" | "transferts" | "car"

export function BookingEngine() {
  const [activeTab, setActiveTab] = useState<TabId>("vols")
  const { t } = useLanguageCurrency()

  const tabs = [
    { id: "vols" as TabId, label: t("booking_engine.tabs.vols"), icon: Plane },
    { id: "hotels-tunisie" as TabId, label: t("booking_engine.tabs.hotels_tunisia"), icon: Building2 },
    { id: "hotels-monde" as TabId, label: t("booking_engine.tabs.hotels_monde"), icon: Globe },
    { id: "omraty" as TabId, label: t("booking_engine.tabs.omraty"), icon: Moon },
    { id: "voyages-organises" as TabId, label: t("booking_engine.tabs.voyages_organises"), icon: Briefcase },
    { id: "transferts" as TabId, label: t("booking_engine.tabs.transfers"), icon: Bus },
    { id: "car" as TabId, label: t("booking_engine.tabs.car"), icon: Car },
  ]

  const handleTabClick = (tabId: TabId) => {
    setActiveTab(tabId)
  }

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
                  onClick={() => handleTabClick(tab.id)}
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
