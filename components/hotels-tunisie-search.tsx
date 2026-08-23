"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCities } from "@/hooks/use-cities"
import { useHotels } from "@/hooks/use-hotels"
import { addDays, differenceInCalendarDays, format } from "date-fns"
import { fr } from "date-fns/locale"
import {
  MapPin,
  Calendar,
  Users,
  Star,
  X,
  Search,
  Check,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { FIELD_SHELL, FieldLabel } from "@/components/search-field"
import { GuestOccupancyPicker } from "@/components/hotel-search/guest-occupancy-picker"
import { calculateOccupancySummary } from "@/lib/hotel-search/reducer"
import { toHotelSearchParams } from "@/lib/hotel-search/api-mapper"
import type { RoomOccupancy, HotelSearchState } from "@/lib/hotel-search/types"
import { defaultRoomOccupancy } from "@/lib/hotel-search/types"

// ============================================================================
// Types matching MyGo API Schema (le client myGo expose `/api/hotels/cities`)
// ============================================================================

import type { City } from "@/hooks/use-cities"
import type { HotelSummaryDTO } from "@/lib/mygo/types"

// ============================================================================
// Static fallback (défini dans useCities)
// ============================================================================

const STAR_OPTIONS = [
  { value: 5, label: "5 Etoiles" },
  { value: 4, label: "4 Etoiles" },
  { value: 3, label: "3 Etoiles" },
  { value: 2, label: "2 Etoiles" },
]

// ============================================================================
// Component
// ============================================================================

export function HotelsTunisieSearch() {
  const router = useRouter()

  // City selection state
  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [citySearchOpen, setCitySearchOpen] = useState(false)

  // Date selection state — arrivée = aujourd'hui, départ = demain (1 nuit
  // minimum) par défaut, standard OTA plutôt que des champs vides.
  const [checkinDate, setCheckinDate] = useState<Date | undefined>(new Date())
  const [checkoutDate, setCheckoutDate] = useState<Date | undefined>(
    addDays(new Date(), 1),
  )
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  // Occupation réelle par chambre (canonique, réutilisée telle quelle —
  // voir lib/hotel-search/types.ts) : plus d'agrégat "adults total" +
  // répartition estimée, chaque chambre porte sa vraie composition.
  const [occupancyRooms, setOccupancyRooms] = useState<RoomOccupancy[]>([
    { ...defaultRoomOccupancy },
  ])
  const [paxPopoverOpen, setPaxPopoverOpen] = useState(false)
  const occupancySummary = useMemo(
    () =>
      calculateOccupancySummary({
        rooms: occupancyRooms,
        dates: { checkIn: new Date(), checkOut: new Date(), nights: 0 },
        nationality: "resident",
        destination: {},
      }),
    [occupancyRooms],
  )

  // Destination : ville (autocomplete existant) ou hôtel précis (recherche
  // directe — HotelSearchQuerySchema.hotelId, déjà supporté côté
  // fournisseur, jamais exposé côté formulaire jusqu'ici).
  const [destinationMode, setDestinationMode] = useState<"city" | "hotel">("city")
  const [selectedHotel, setSelectedHotel] = useState<HotelSummaryDTO | null>(null)
  const [hotelSearchOpen, setHotelSearchOpen] = useState(false)
  const { hotels, loading: hotelsLoading } = useHotels(undefined, destinationMode === "hotel")

  // Filters state
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [selectedStars, setSelectedStars] = useState<number[]>([])
  const [starsPopoverOpen, setStarsPopoverOpen] = useState(false)

  // Cities (TanStack Query — dedup, retries, stale-while-revalidate)
  const { cities, loading: citiesLoading, error: citiesError } = useCities()

  const nightsCount =
    checkinDate && checkoutDate
      ? differenceInCalendarDays(checkoutDate, checkinDate)
      : 0

  const isFormValid =
    (destinationMode === "city" ? !!selectedCity : !!selectedHotel) &&
    !!checkinDate &&
    !!checkoutDate &&
    nightsCount >= 1

  // Build the canonical search state, then delegate entirely au vrai
  // provider adapter (lib/hotel-search/api-mapper.ts::toHotelSearchParams)
  // — plus de construction de query params dupliquée ici.
  const buildSearchState = useCallback((): HotelSearchState | null => {
    if (!checkinDate || !checkoutDate) return null
    if (destinationMode === "city" && !selectedCity) return null
    if (destinationMode === "hotel" && !selectedHotel) return null

    return {
      destination:
        destinationMode === "hotel" && selectedHotel
          ? {
              cityId: selectedHotel.cityId,
              city: selectedHotel.cityName,
              hotelId: selectedHotel.id,
              hotelName: selectedHotel.name,
            }
          : { cityId: selectedCity!.id, city: selectedCity!.name, zone: selectedCity!.region },
      dates: { checkIn: checkinDate, checkOut: checkoutDate, nights: nightsCount },
      rooms: occupancyRooms,
      nationality: "resident", // myGo (Hôtel Tunisie) n'exploite pas ce paramètre — voir GuestOccupancyPicker showNationality={false}.
    }
  }, [destinationMode, selectedCity, selectedHotel, checkinDate, checkoutDate, nightsCount, occupancyRooms])

  const handleSearch = () => {
    const state = buildSearchState()
    if (!state) return
    const params = toHotelSearchParams(state, {
      stars: selectedStars,
      onlyAvailable,
    })
    if (destinationMode === "city" && selectedCity) {
      params.set("city", selectedCity.name)
    } else if (destinationMode === "hotel" && selectedHotel?.cityName) {
      params.set("city", selectedHotel.cityName)
    }
    router.push(`/hotels/search?${params.toString()}`)
  }

  // Star filter toggle
  const toggleStar = (star: number) => {
    if (selectedStars.includes(star)) {
      setSelectedStars(selectedStars.filter((s) => s !== star))
    } else {
      setSelectedStars([...selectedStars, star].sort((a, b) => b - a))
    }
  }

  // Date range display — inclut le nombre de nuitées ("3 nuits").
  const dateRangeDisplay = useMemo(() => {
    if (checkinDate && checkoutDate) {
      const nights =
        nightsCount > 0
          ? ` · ${nightsCount} nuit${nightsCount > 1 ? "s" : ""}`
          : ""
      return `${format(checkinDate, "dd MMM", { locale: fr })} - ${format(checkoutDate, "dd MMM yyyy", { locale: fr })}${nights}`
    }
    if (checkinDate) {
      return `${format(checkinDate, "dd MMM yyyy", { locale: fr })} - ...`
    }
    return "Sélectionner les dates"
  }, [checkinDate, checkoutDate, nightsCount])

  // Pax display — dérivé du vrai résumé d'occupation par chambre (plus
  // d'agrégat séparé désynchronisable de l'état réel des chambres).
  const paxDisplay = useMemo(() => {
    const { totalRooms, totalAdults, totalBigKids, totalBabies } =
      occupancySummary
    const parts: string[] = []
    parts.push(`${totalRooms} Chambre${totalRooms > 1 ? "s" : ""}`)
    parts.push(`${totalAdults} Adulte${totalAdults > 1 ? "s" : ""}`)
    if (totalBigKids > 0) {
      parts.push(`${totalBigKids} Enfant${totalBigKids > 1 ? "s" : ""}`)
    }
    if (totalBabies > 0) {
      parts.push(`${totalBabies} Bébé${totalBabies > 1 ? "s" : ""}`)
    }
    return parts.join(", ")
  }, [occupancySummary])

  return (
    <div className="space-y-5">
      {/* Main Search Row */}
      <div className="flex flex-col gap-2.5 lg:flex-row">
        {/* Destination : ville (zone touristique) ou hôtel précis */}
        <div className="min-w-0 flex-1">
          <Popover
            open={destinationMode === "city" ? citySearchOpen : hotelSearchOpen}
            onOpenChange={
              destinationMode === "city" ? setCitySearchOpen : setHotelSearchOpen
            }
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-label="Destination"
                aria-expanded={
                  destinationMode === "city" ? citySearchOpen : hotelSearchOpen
                }
                aria-controls="hotel-search-destination-listbox"
                className={FIELD_SHELL}
              >
                <FieldLabel icon={destinationMode === "city" ? MapPin : Building2}>
                  Destination
                </FieldLabel>
                {destinationMode === "city" ? (
                  selectedCity ? (
                    <span className="truncate text-sm font-semibold">
                      {selectedCity.name}
                      {selectedCity.region && (
                        <span className="text-muted-foreground ml-1 font-normal">
                          ({selectedCity.region})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground truncate text-sm font-normal">
                      Rechercher une ville...
                    </span>
                  )
                ) : selectedHotel ? (
                  <span className="truncate text-sm font-semibold">
                    {selectedHotel.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground truncate text-sm font-normal">
                    Rechercher un hôtel...
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              id="hotel-search-destination-listbox"
              className="w-[320px] p-0"
              align="start"
            >
              {/* Toggle Ville / Hôtel — recherche directe par hôtel
                  (myGo::listHotels, déjà exposée par /api/hotels/list) */}
              <div className="flex gap-1 border-b p-2">
                <button
                  type="button"
                  onClick={() => setDestinationMode("city")}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    destinationMode === "city"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Ville / Zone
                </button>
                <button
                  type="button"
                  onClick={() => setDestinationMode("hotel")}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    destinationMode === "hotel"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Hôtel
                </button>
              </div>

              {destinationMode === "city" ? (
                <Command>
                  <CommandInput placeholder="Rechercher une ville..." />
                  <CommandList>
                    <CommandEmpty>
                      {citiesLoading
                        ? "Chargement..."
                        : citiesError
                          ? `Erreur de chargement (${citiesError})`
                          : "Aucune ville trouvée."}
                    </CommandEmpty>
                    <CommandGroup heading="Zones touristiques">
                      {cities.map((city) => (
                        <CommandItem
                          key={city.id}
                          value={`${city.name} ${city.region || ""}`}
                          onSelect={() => {
                            setSelectedCity(city)
                            setCitySearchOpen(false)
                          }}
                        >
                          <MapPin className="text-muted-foreground mr-2 size-4" />
                          <span>{city.name}</span>
                          {city.region && (
                            <span className="text-muted-foreground ml-auto text-xs">
                              {city.region}
                            </span>
                          )}
                          {selectedCity?.id === city.id && (
                            <Check className="text-primary ml-2 size-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              ) : (
                <Command>
                  <CommandInput placeholder="Rechercher un hôtel..." />
                  <CommandList>
                    <CommandEmpty>
                      {hotelsLoading
                        ? "Chargement..."
                        : "Aucun hôtel trouvé."}
                    </CommandEmpty>
                    <CommandGroup heading="Hôtels">
                      {hotels.map((hotel) => (
                        <CommandItem
                          key={hotel.id}
                          value={`${hotel.name} ${hotel.cityName}`}
                          onSelect={() => {
                            setSelectedHotel(hotel)
                            setHotelSearchOpen(false)
                          }}
                        >
                          <Building2 className="text-muted-foreground mr-2 size-4" />
                          <span>{hotel.name}</span>
                          <span className="text-muted-foreground ml-auto text-xs">
                            {hotel.cityName}
                          </span>
                          {selectedHotel?.id === hotel.id && (
                            <Check className="text-primary ml-2 size-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Date Range Picker */}
        <div className="min-w-0 flex-1">
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-label="Dates du séjour"
                aria-expanded={datePopoverOpen}
                aria-controls="hotel-search-dates-panel"
                className={FIELD_SHELL}
              >
                <FieldLabel icon={Calendar}>Dates du séjour</FieldLabel>
                <span
                  className={cn(
                    !checkinDate && "text-muted-foreground font-normal",
                    "truncate text-sm font-semibold",
                  )}
                >
                  {dateRangeDisplay}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent id="hotel-search-dates-panel" className="w-auto p-0" align="start">
              <div className="border-b p-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs">Check-in</p>
                    <p className="font-medium">
                      {checkinDate ? format(checkinDate, "dd/MM/yyyy") : "—"}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs">Check-out</p>
                    <p className="font-medium">
                      {checkoutDate ? format(checkoutDate, "dd/MM/yyyy") : "—"}
                    </p>
                  </div>
                </div>
              </div>
              <CalendarComponent
                mode="range"
                selected={
                  checkinDate && checkoutDate
                    ? { from: checkinDate, to: checkoutDate }
                    : checkinDate
                      ? { from: checkinDate, to: undefined }
                      : undefined
                }
                onSelect={(range) => {
                  setCheckinDate(range?.from)
                  setCheckoutDate(range?.to)
                  if (range?.from && range?.to) {
                    setDatePopoverOpen(false)
                  }
                }}
                numberOfMonths={2}
                disabled={{ before: new Date() }}
                locale={fr}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Pax Selector */}
        <div className="min-w-0 flex-1">
          <Popover open={paxPopoverOpen} onOpenChange={setPaxPopoverOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={FIELD_SHELL}>
                <FieldLabel icon={Users}>Voyageurs</FieldLabel>
                <span className="truncate text-sm font-semibold">{paxDisplay}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="shadow-e2b-elevated max-h-[70vh] w-[340px] overflow-y-auto rounded-2xl p-4"
              align="start"
            >
              {/* myGo (Hôtel Tunisie) n'exploite aucun paramètre nationalité
                  — voir showNationality dans guest-occupancy-picker.tsx. */}
              <GuestOccupancyPicker
                initialState={occupancyRooms}
                onChange={setOccupancyRooms}
                showNationality={false}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Search Button */}
        <div className="flex items-stretch">
          <Button
            onClick={handleSearch}
            disabled={!isFormValid}
            size="lg"
            className="from-primary to-accent hover:shadow-primary/30 h-auto w-full gap-2 rounded-2xl bg-gradient-to-r px-8 text-base font-semibold text-white uppercase shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg lg:w-auto"
          >
            <Search className="size-4" />
            Rechercher
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        {/* Only Available Checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="only-available"
            checked={onlyAvailable}
            onCheckedChange={(checked) => setOnlyAvailable(checked === true)}
            className="rounded"
          />
          <label
            htmlFor="only-available"
            className="text-muted-foreground cursor-pointer text-sm select-none"
          >
            Disponibilité réelle uniquement
          </label>
        </div>

        {/* Star Category Filter */}
        <Popover open={starsPopoverOpen} onOpenChange={setStarsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full"
            >
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {selectedStars.length > 0 ? (
                <span>{selectedStars.join(", ")} étoiles</span>
              ) : (
                <span>Catégorie</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="space-y-1">
              {STAR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleStar(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    selectedStars.includes(option.value)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: option.value }).map((_, i) => (
                      <Star
                        key={i}
                        className="size-3 fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  <span className="ml-auto">
                    {selectedStars.includes(option.value) && (
                      <Check className="text-primary size-4" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            {selectedStars.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-xs"
                onClick={() => setSelectedStars([])}
              >
                Effacer les filtres
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {/* Active Filters Display */}
        {selectedStars.length > 0 && (
          <div className="flex items-center gap-1.5">
            {selectedStars.map((star) => (
              <Badge
                key={star}
                variant="secondary"
                className="gap-1 rounded-full pr-1"
              >
                {star}
                <Star className="size-2.5 fill-amber-400 text-amber-400" />
                <button
                  onClick={() => toggleStar(star)}
                  className="hover:bg-muted-foreground/20 ml-0.5 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
