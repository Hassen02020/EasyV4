"use client"

import { useRouter } from "@/i18n/navigation"

import { useState } from "react"

import {
  Building2,
  Globe,
  Moon,
  Briefcase,
  MapPin,
  CalendarDays,
  Users,
  Plus,
  Minus,
  Clock,
  Search,
  Sparkles,
  Compass,
} from "lucide-react"

import { Button } from "@/components/ui/button"

import { Input } from "@/components/ui/input"

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

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { FIELD_SHELL, FIELD_INPUT_RESET, FieldLabel } from "@/components/search-field"

import { DestinationAutocomplete } from "@/components/destination-autocomplete"

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

/**
 * Navigation commerciale (Phase 13, Partie 20) : le périmètre de lancement
 * prioritaire est Hôtels Tunisie / Hôtels Monde / Omraty / Voyages
 * Organisés / Attractions — Vols/Transferts/Car restent des modules réels
 * (code et pages intacts, atteignables directement via /vols, /transferts,
 * /car) mais ne sont plus mis en avant dans l'onglet de recherche
 * principal, pour ne pas disperser l'effort commercial. Attractions a un
 * vrai parcours public complet (/attractions, /attractions/[slug],
 * /attractions/[slug]/book) — plus de raison de l'exclure ici.
 */
const tabsConfig = [
  { id: "hotels-tunisie", labelKey: "tabHotelsTunisie", icon: Building2 },
  { id: "hotels-monde", labelKey: "tabHotelsMonde", icon: Globe },
  { id: "omraty", labelKey: "tabOmraty", icon: Moon },
  { id: "voyages-organises", labelKey: "tabVoyages", icon: Briefcase },
  { id: "attractions", labelKey: "tabAttractions", icon: Compass },
] as const

type TabId = (typeof tabsConfig)[number]["id"]

// Sidi Bou Said — iconic Tunisian Mediterranean coast (white & blue village)

const HERO_BG_URL =
  "https://images.unsplash.com/photo-1531761535209-180857e963b9?w=2400&q=80&auto=format&fit=crop"

/** Rend le formulaire du module actif — partagé par la carte flottante desktop et le bottom-sheet mobile. */
function ActiveModuleForm({ activeTab }: { activeTab: TabId }) {
  switch (activeTab) {
    case "hotels-tunisie":
      return <HotelsTunisieSearch />
    case "hotels-monde":
      return <HotelsMondeForm />
    case "omraty":
      return <OmratyForm />
    case "voyages-organises":
      return <VoyagesOrganisesForm />
    case "attractions":
      return <AttractionsForm />
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
  const t = useTranslations("Common")

  return (
    <div
      role="tablist"
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
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
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

export function BookingEngine() {
  const [activeTab, setActiveTab] = useState<TabId>("hotels-tunisie")
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useTranslations("Common")
  const tHome = useTranslations("Home")

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
            {tHome("heroKicker")}
          </span>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
            {tHome("heroTitleLine1")}
            <br />
            <span className="text-accent">{tHome("heroTitleAccent")}</span>
          </h1>

          <p className="mt-3 max-w-md text-base text-white/85 sm:text-lg">
            {tHome("heroSubtitle")}
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
            <ActiveModuleForm activeTab={activeTab} />
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
                    {tHome("mobileTriggerSubtitle")}
                  </span>
                </span>

                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Search className="size-4" />
                </span>
              </button>
            </DrawerTrigger>

            <DrawerContent className="max-h-[92vh] rounded-t-[1.75rem]">
              <DrawerTitle className="sr-only">
                {tHome("searchDrawerTitle", { tab: t(activeTabConfig.labelKey) })}
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
                    {tHome("closeButton")}
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
                <ActiveModuleForm activeTab={activeTab} />
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

/** Nombre de nuits entre deux dates ISO (yyyy-MM-dd), ou `null` si non calculable — formaté (pluriel ICU) au point d'appel via `Home.nightsCount`. */
function nightsCount(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn))
  return nights > 0 ? nights : null
}

/** Ajoute `days` jours à une date ISO (yyyy-MM-dd) et retourne une date ISO. */
function addDaysIso(dateIso: string, days: number): string {
  return format(addDays(new Date(dateIso), days), "yyyy-MM-dd")
}

function SearchSubmit({
  children,
}: {
  children?: React.ReactNode
}) {
  const t = useTranslations("Common")
  return (
    <Button
      type="submit"
      size="lg"
      className="from-primary to-accent hover:shadow-primary/30 w-full gap-2 rounded-2xl bg-gradient-to-r px-8 text-base font-semibold text-white uppercase shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 sm:w-auto"
    >
      <Search className="size-4" />
      {children ?? t("rechercher")}
    </Button>
  )
}

// ----------------------------------------------------------------------------

// Per-module forms — RECHERCHER navigue vers la page de résultats réelle du
// module (router.push), un toast n'apparaît qu'en cas de saisie invalide.

// ----------------------------------------------------------------------------

function HotelsMondeForm() {
  const router = useRouter()
  const t = useTranslations("Home")
  const [destination, setDestination] = useState("")
  const [checkIn, setCheckIn] = useState(TODAY_ISO)
  const [checkOut, setCheckOut] = useState(TOMORROW_ISO)
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(2)
  const [occupancyOpen, setOccupancyOpen] = useState(false)

  const nights = nightsCount(checkIn, checkOut)
  const occupancySummary = [
    t("roomsCount", { count: rooms }),
    t("adultsCount", { count: adults }),
  ].join(", ")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()

        if (!destination) {
          toast.error(t("hotelsMondeDestinationError"))
          return
        }

        if (checkOut <= checkIn) {
          toast.error(t("hotelsMondeDateError"))
          return
        }

        // Mêmes noms de params que /hotels-monde/search
        // (lib/hotels-monde/search-state.ts) — on va directement aux
        // résultats, jamais à la page formulaire /hotels-monde, pour ne pas
        // perdre la saisie de l'utilisateur en cours de route.
        const params = new URLSearchParams()
        params.set("destination", destination)
        params.set("checkIn", checkIn)
        params.set("checkOut", checkOut)
        params.set("rooms", String(rooms))
        params.set("adults", String(adults))
        router.push(`/hotels-monde/search?${params.toString()}`)
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <DestinationAutocomplete
            module="hotels_monde_slug"
            value={destination}
            onChange={setDestination}
            label={t("destinationWorldLabel")}
          />
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>{t("arrivalLabel")}</FieldLabel>
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
            {t("departureLabel")}
            {nights ? (
              <span className="text-primary normal-case"> · {t("nightsCount", { count: nights })}</span>
            ) : null}
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
              <FieldLabel icon={Users}>{t("occupancyLabel")}</FieldLabel>
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
              label={t("roomsFieldLabel")}
              min={1}
              max={5}
              value={rooms}
              onChange={setRooms}
            />
            <CounterRow
              label={t("adultsFieldLabel")}
              sublabel={t("adultsFieldSublabel18")}
              min={1}
              max={16}
              value={adults}
              onChange={setAdults}
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
// pour que le filtre passé à /omra matche de vrais packages — libellés
// traduits au rendu via `Omra.filterProgrammes.{value}` (mêmes clés que
// components/omra/omra-search.tsx, Lot 2 de la migration i18n).
const OMRA_PROGRAMME_VALUES = ["omra", "ramadan", "umrah_plus", "hajj"] as const

// Idem, `Omra.months.{value}` (mêmes clés que omra-search.tsx).
const OMRA_MONTH_VALUES = Array.from({ length: 12 }, (_, i) => String(i + 1))

function OmratyForm() {
  const router = useRouter()
  const t = useTranslations("Home")
  const tOmra = useTranslations("Omra")
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
          <FieldLabel icon={Moon}>{t("programmeLabel")}</FieldLabel>
          <Select value={programme} onValueChange={setProgramme}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
              <SelectValue placeholder={tOmra("allProgrammes")} />
            </SelectTrigger>

            <SelectContent>
              {OMRA_PROGRAMME_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {tOmra(`filterProgrammes.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={CalendarDays}>{t("departureMonthLabel")}</FieldLabel>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
              <SelectValue placeholder={tOmra("allMonths")} />
            </SelectTrigger>

            <SelectContent>
              {OMRA_MONTH_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {tOmra(`months.${v}`)}
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

// Doit correspondre aux plages lues par parseDurationRange() dans
// app/packages/page.tsx — libellés via `Packages.durations.{value}`.
const PACKAGE_DURATION_VALUES = ["3-5", "6-8", "9-12", "13+"] as const

function VoyagesOrganisesForm() {
  const router = useRouter()
  const t = useTranslations("Home")
  const tPackages = useTranslations("Packages")
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
        <DestinationAutocomplete
          module="packages_slug"
          value={destination}
          onChange={setDestination}
          label={t("destinationLabel")}
        />

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Clock}>{t("durationLabel")}</FieldLabel>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
              <SelectValue placeholder={tPackages("allDurations")} />
            </SelectTrigger>

            <SelectContent>
              {PACKAGE_DURATION_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {tPackages(`durations.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={FIELD_SHELL}>
          <FieldLabel icon={Users}>{t("travelersLabel")}</FieldLabel>
          <Select value={travelers} onValueChange={setTravelers}>
            <SelectTrigger className={cn(FIELD_INPUT_RESET, "[&>svg]:opacity-40")}>
              <SelectValue placeholder={t("travelersLabel")} />
            </SelectTrigger>

            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("travelersOption", { count: n })}
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

function AttractionsForm() {
  const router = useRouter()
  const tAttractions = useTranslations("Attractions")
  const [q, setQ] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        const qs = params.toString()
        router.push(`/attractions${qs ? `?${qs}` : ""}`)
      }}
      className="space-y-5"
    >
      <div className={FIELD_SHELL}>
        <FieldLabel icon={MapPin}>{tAttractions("kicker")}</FieldLabel>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tAttractions("searchPlaceholder")}
          className={FIELD_INPUT_RESET}
        />
      </div>

      <div className="flex justify-end pt-1">
        <SearchSubmit>{tAttractions("searchButton")}</SearchSubmit>
      </div>
    </form>
  )
}
