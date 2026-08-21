"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCities } from "@/hooks/use-cities"
import { addDays, differenceInCalendarDays, format } from "date-fns"
import { fr } from "date-fns/locale"
import {
  MapPin,
  Calendar,
  Users,
  Star,
  X,
  Plus,
  Minus,
  Search,
  Check,
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
import { splitIntoRooms, encodeRoomsParam } from "@/lib/mygo/room-split"

// ============================================================================
// Types matching MyGo API Schema (le client myGo expose `/api/hotels/cities`)
// ============================================================================

import type { City } from "@/hooks/use-cities"

interface Pax {
  Adult: number
  Child: number[] // Array of ages (0-17)
}

interface BookingDetails {
  Checkin: string // YYYY-MM-DD
  Checkout: string // YYYY-MM-DD
}

interface Filters {
  OnlyAvailable: boolean
  Category: number[] // Stars array [3, 4, 5]
}

interface HotelSearchRequest {
  CityId: number
  BookingDetails: BookingDetails
  Pax: Pax
  Filters: Filters
}

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

  // Pax state
  const [rooms, setRooms] = useState(1)
  const [adults, setAdults] = useState(2)
  // Bébés (0-2 ans) et Enfants (3-17 ans) sont distincts côté UX, mais
  // partagent le même tableau d'âges côté requête — c'est exactement ce que
  // le schéma MyGo (`Pax.Child: number[]`) attend déjà, donc aucune
  // modification du contrat d'API : on ajoute juste un âge par défaut selon
  // le bouton cliqué (1 an pour un bébé, 5 ans pour un enfant).
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [paxPopoverOpen, setPaxPopoverOpen] = useState(false)

  const babiesCount = childrenAges.filter((age) => age <= 2).length
  const bigKidsCount = childrenAges.filter((age) => age > 2).length

  // Filters state
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [selectedStars, setSelectedStars] = useState<number[]>([])
  const [starsPopoverOpen, setStarsPopoverOpen] = useState(false)

  // Cities (TanStack Query — dedup, retries, stale-while-revalidate)
  const { cities, loading: citiesLoading, error: citiesError } = useCities()

  // Build the API request object
  const buildSearchRequest = useCallback((): HotelSearchRequest | null => {
    if (!selectedCity || !checkinDate || !checkoutDate) {
      return null
    }

    return {
      CityId: selectedCity.id,
      BookingDetails: {
        Checkin: format(checkinDate, "yyyy-MM-dd"),
        Checkout: format(checkoutDate, "yyyy-MM-dd"),
      },
      Pax: {
        Adult: adults,
        Child: childrenAges,
      },
      Filters: {
        OnlyAvailable: onlyAvailable,
        Category: selectedStars,
      },
    }
  }, [
    selectedCity,
    checkinDate,
    checkoutDate,
    adults,
    childrenAges,
    onlyAvailable,
    selectedStars,
  ])

  const handleSearch = () => {
    const request = buildSearchRequest()
    if (!request) return

    const params = new URLSearchParams({
      cityId: String(request.CityId),
      city: selectedCity?.name ?? "",
      checkin: request.BookingDetails.Checkin,
      checkout: request.BookingDetails.Checkout,
      roomsCount: String(rooms),
      adults: String(request.Pax.Adult),
    })
    if (request.Pax.Child.length > 0) {
      params.set("children", request.Pax.Child.join(","))
    }
    if (request.Filters.Category.length > 0) {
      params.set("stars", request.Filters.Category.join(","))
    }
    if (request.Filters.OnlyAvailable) {
      params.set("onlyAvailable", "1")
    }
    // Recherche multi-chambres réelle (le connecteur myGo accepte nativement
    // `Rooms: [{Adult, Child}]`, voir lib/mygo/client.ts) — au-delà d'une
    // chambre, on répartit équitablement les adultes et les âges renseignés
    // pour que la disponibilité/prix reflètent la vraie composition du
    // groupe plutôt qu'une seule chambre agrégée.
    if (rooms > 1) {
      params.set("rooms", encodeRoomsParam(splitIntoRooms(rooms, adults, childrenAges)))
    }

    router.push(`/hotels/search?${params.toString()}`)
  }

  const nightsCount =
    checkinDate && checkoutDate
      ? differenceInCalendarDays(checkoutDate, checkinDate)
      : 0

  const isFormValid =
    selectedCity && checkinDate && checkoutDate && nightsCount >= 1

  // Children management
  const addBaby = () => {
    if (childrenAges.length < 4) {
      setChildrenAges([...childrenAges, 1]) // Bébé, âge par défaut 1 an
    }
  }

  const addChild = () => {
    if (childrenAges.length < 4) {
      setChildrenAges([...childrenAges, 5]) // Enfant, âge par défaut 5 ans
    }
  }

  const removeChild = (index: number) => {
    setChildrenAges(childrenAges.filter((_, i) => i !== index))
  }

  const updateChildAge = (index: number, age: number) => {
    const newAges = [...childrenAges]
    newAges[index] = age
    setChildrenAges(newAges)
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

  // Pax display
  const paxDisplay = useMemo(() => {
    const parts: string[] = []
    parts.push(`${rooms} Chambre${rooms > 1 ? "s" : ""}`)
    parts.push(`${adults} Adulte${adults > 1 ? "s" : ""}`)
    if (bigKidsCount > 0) {
      parts.push(`${bigKidsCount} Enfant${bigKidsCount > 1 ? "s" : ""}`)
    }
    if (babiesCount > 0) {
      parts.push(`${babiesCount} Bébé${babiesCount > 1 ? "s" : ""}`)
    }
    return parts.join(", ")
  }, [rooms, adults, bigKidsCount, babiesCount])

  return (
    <div className="space-y-5">
      {/* Main Search Row */}
      <div className="flex flex-col gap-2.5 lg:flex-row">
        {/* City Autocomplete */}
        <div className="min-w-0 flex-1">
          <Popover open={citySearchOpen} onOpenChange={setCitySearchOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-label="Destination"
                aria-expanded={citySearchOpen}
                aria-controls="hotel-search-city-listbox"
                className={FIELD_SHELL}
              >
                <FieldLabel icon={MapPin}>Destination</FieldLabel>
                {selectedCity ? (
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
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              id="hotel-search-city-listbox"
              className="w-[320px] p-0"
              align="start"
            >
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
            <PopoverContent className="w-[320px] rounded-2xl p-4 shadow-e2b-elevated" align="start">
              <div className="space-y-4">
                {/* Rooms */}
                <div className="flex items-center justify-between">
                  <p className="font-medium">Chambres</p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setRooms(Math.max(1, rooms - 1))}
                      disabled={rooms <= 1}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">
                      {rooms}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setRooms(Math.min(8, rooms + 1))}
                      disabled={rooms >= 8}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Adults */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Adultes</p>
                    <p className="text-muted-foreground text-xs">
                      18 ans et plus
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setAdults(Math.max(1, adults - 1))}
                      disabled={adults <= 1}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">
                      {adults}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setAdults(Math.min(6, adults + 1))}
                      disabled={adults >= 6}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Children Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enfants</p>
                    <p className="text-muted-foreground text-xs">3-17 ans</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={addChild}
                    disabled={childrenAges.length >= 4}
                  >
                    <Plus className="mr-1 size-3" />
                    Ajouter
                  </Button>
                </div>

                {/* Babies Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Bébés</p>
                    <p className="text-muted-foreground text-xs">0-2 ans</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={addBaby}
                    disabled={childrenAges.length >= 4}
                  >
                    <Plus className="mr-1 size-3" />
                    Ajouter
                  </Button>
                </div>

                {/* Children/Babies Age Selectors — un seul tableau d'âges
                    partagé (voir commentaire du state childrenAges) */}
                {childrenAges.length > 0 && (
                  <div className="border-muted space-y-2 border-l-2 pl-2">
                    {childrenAges.map((age, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-muted-foreground w-16 text-sm">
                          {age <= 2 ? "Bébé" : "Enfant"} {index + 1}
                        </span>
                        <select
                          value={age}
                          onChange={(e) =>
                            updateChildAge(index, parseInt(e.target.value))
                          }
                          className="border-input bg-background focus-visible:ring-ring flex h-9 w-full max-w-[100px] rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                          {Array.from({ length: 18 }, (_, i) => (
                            <option key={i} value={i}>
                              {i} an{i > 1 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-7"
                          onClick={() => removeChild(index)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
