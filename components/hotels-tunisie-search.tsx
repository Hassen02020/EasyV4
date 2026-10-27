"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { useCities } from "@/hooks/use-cities"
import { MapPin, Users, X, Plus, Minus, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { FIELD_SHELL, FieldLabel } from "@/components/search-field"
import { DateRangePicker } from "@/components/hotel-search/date-range-picker"
import { calculateNights, formatDateIso } from "@/lib/hotels/date-utils"
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
// Component
// ============================================================================

export interface HotelsTunisieSearchProps {
  /** Préremplissage (ex. widget "Modifier" ouvert depuis la page résultats). */
  initialCity?: City | null
  initialCheckin?: Date
  initialCheckout?: Date
  initialRooms?: number
  initialAdults?: number
  initialChildrenAges?: number[]
  /** Appelé juste avant la navigation vers /hotels/search (ex. fermer un Sheet). */
  onSearchSubmit?: () => void
}

export function HotelsTunisieSearch({
  initialCity = null,
  initialCheckin,
  initialCheckout,
  initialRooms = 1,
  initialAdults = 2,
  initialChildrenAges = [],
  onSearchSubmit,
}: HotelsTunisieSearchProps = {}) {
  const router = useRouter()
  const t = useTranslations("Hotels")
  const tCommon = useTranslations("Common")
  const locale = useLocale()

  // City selection state
  const [selectedCity, setSelectedCity] = useState<City | null>(initialCity)
  const [citySearchOpen, setCitySearchOpen] = useState(false)

  // Date selection state — aucune date par défaut (spec Hotel Search Engine
  // V2 §3.1 "Aucun calendrier ouvert par défaut" + même comportement que
  // WorldHotelSearch) : un champ pré-rempli "aujourd'hui → demain"
  // constituait déjà une plage COMPLÈTE aux yeux de react-day-picker, donc
  // cliquer une date future pour choisir une NOUVELLE arrivée était
  // interprété comme "déplacer le départ" (addToRange, branche `isAfter`)
  // en gardant l'arrivée bloquée sur aujourd'hui — reproduit et confirmé en
  // E2E réel avant ce correctif. Partir d'une sélection vide élimine cette
  // ambiguïté : le premier clic pose toujours l'arrivée.
  const [checkinDate, setCheckinDate] = useState<Date | null>(
    initialCheckin ?? null,
  )
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(
    initialCheckout ?? null,
  )

  // Pax state
  const [rooms, setRooms] = useState(initialRooms)
  const [adults, setAdults] = useState(initialAdults)
  // Bébés (0-2 ans) et Enfants (3-17 ans) sont distincts côté UX, mais
  // partagent le même tableau d'âges côté requête — c'est exactement ce que
  // le schéma MyGo (`Pax.Child: number[]`) attend déjà, donc aucune
  // modification du contrat d'API : on ajoute juste un âge par défaut selon
  // le bouton cliqué (1 an pour un bébé, 5 ans pour un enfant).
  const [childrenAges, setChildrenAges] =
    useState<number[]>(initialChildrenAges)
  const [paxPopoverOpen, setPaxPopoverOpen] = useState(false)

  const babiesCount = childrenAges.filter((age) => age <= 2).length
  const bigKidsCount = childrenAges.filter((age) => age > 2).length

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
        Checkin: formatDateIso(checkinDate),
        Checkout: formatDateIso(checkoutDate),
      },
      Pax: {
        Adult: adults,
        Child: childrenAges,
      },
      Filters: {
        // Filtres retirés du formulaire (HOTELS-TUNISIE-FILTERS-REMOVE-01) —
        // comportement par défaut historique conservé : toujours
        // "disponibilité réelle" et aucun filtre étoiles pré-recherche.
        OnlyAvailable: true,
        Category: [],
      },
    }
  }, [selectedCity, checkinDate, checkoutDate, adults, childrenAges])

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
      params.set(
        "rooms",
        encodeRoomsParam(splitIntoRooms(rooms, adults, childrenAges)),
      )
    }

    onSearchSubmit?.()
    router.push(`/hotels/search?${params.toString()}`)
  }

  const nightsCount = calculateNights(checkinDate, checkoutDate)

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

  // Pax display
  const paxDisplay = useMemo(() => {
    const parts: string[] = []
    parts.push(t("paxRoomsCount", { n: rooms }))
    parts.push(t("paxAdultsCount", { n: adults }))
    if (bigKidsCount > 0) {
      parts.push(t("paxChildrenCount", { n: bigKidsCount }))
    }
    if (babiesCount > 0) {
      parts.push(t("paxBabiesCount", { n: babiesCount }))
    }
    return parts.join(", ")
  }, [rooms, adults, bigKidsCount, babiesCount, t])

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
                aria-label={t("destination")}
                aria-expanded={citySearchOpen}
                aria-controls="hotel-search-city-listbox"
                className={FIELD_SHELL}
              >
                <FieldLabel icon={MapPin}>{t("destination")}</FieldLabel>
                {selectedCity ? (
                  <span className="truncate text-sm font-semibold">
                    {selectedCity.name}
                    {selectedCity.region && (
                      <span className="text-muted-foreground ms-1 font-normal">
                        ({selectedCity.region})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground truncate text-sm font-normal">
                    {t("searchCityPlaceholder")}
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
                <CommandInput placeholder={t("searchCityPlaceholder")} />
                <CommandList>
                  <CommandEmpty>
                    {citiesLoading
                      ? t("loadingCities")
                      : citiesError
                        ? t("citiesLoadError", { error: citiesError })
                        : t("noCityFound")}
                  </CommandEmpty>
                  <CommandGroup heading={t("touristZones")}>
                    {cities.map((city) => (
                      <CommandItem
                        key={city.id}
                        value={`${city.name} ${city.region || ""}`}
                        onSelect={() => {
                          setSelectedCity(city)
                          setCitySearchOpen(false)
                        }}
                      >
                        <MapPin className="text-muted-foreground me-2 size-4" />
                        <span>{city.name}</span>
                        {city.region && (
                          <span className="text-muted-foreground ms-auto text-xs">
                            {city.region}
                          </span>
                        )}
                        {selectedCity?.id === city.id && (
                          <Check className="text-primary ms-2 size-4" />
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
          <DateRangePicker
            checkIn={checkinDate}
            checkOut={checkoutDate}
            onChange={({ checkIn, checkOut }) => {
              setCheckinDate(checkIn)
              setCheckoutDate(checkOut)
            }}
            locale={locale}
            label={t("stayDates")}
          />
        </div>

        {/* Pax Selector */}
        <div className="min-w-0 flex-1">
          <Popover open={paxPopoverOpen} onOpenChange={setPaxPopoverOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={FIELD_SHELL}>
                <FieldLabel icon={Users}>{tCommon("voyageurs")}</FieldLabel>
                <span className="truncate text-sm font-semibold">
                  {paxDisplay}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="shadow-e2b-elevated w-[320px] rounded-2xl p-4"
              align="start"
            >
              <div className="space-y-4">
                {/* Rooms */}
                <div className="flex items-center justify-between">
                  <p className="font-medium">{t("roomsFieldLabel")}</p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setRooms(Math.max(1, rooms - 1))}
                      disabled={rooms <= 1}
                      aria-label={t("decreaseRoomsAria")}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">{rooms}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setRooms(Math.min(8, rooms + 1))}
                      disabled={rooms >= 8}
                      aria-label={t("increaseRoomsAria")}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Adults */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t("adultsFieldLabel")}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("adultsAgeHint")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => setAdults(Math.max(1, adults - 1))}
                      disabled={adults <= 1}
                      aria-label={t("decreaseAdultsAria")}
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
                      aria-label={t("increaseAdultsAria")}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Children Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t("childrenFieldLabel")}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("childrenAgeHint")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={addChild}
                    disabled={childrenAges.length >= 4}
                  >
                    <Plus className="me-1 size-3" />
                    {t("addAction")}
                  </Button>
                </div>

                {/* Babies Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t("babiesFieldLabel")}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("babiesAgeHint")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={addBaby}
                    disabled={childrenAges.length >= 4}
                  >
                    <Plus className="me-1 size-3" />
                    {t("addAction")}
                  </Button>
                </div>

                {/* Children/Babies Age Selectors — un seul tableau d'âges
                    partagé (voir commentaire du state childrenAges) */}
                {childrenAges.length > 0 && (
                  <div className="border-muted space-y-2 border-s-2 ps-2">
                    {childrenAges.map((age, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-muted-foreground w-16 text-sm">
                          {age <= 2 ? t("babyWord") : t("childWord")}{" "}
                          {index + 1}
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
                              {t("ageYears", { n: i })}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-7"
                          onClick={() => removeChild(index)}
                          aria-label={
                            age <= 2
                              ? t("removeBabyAria", { n: index + 1 })
                              : t("removeChildAria", { n: index + 1 })
                          }
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
            {t("searchButton")}
          </Button>
        </div>
      </div>
    </div>
  )
}
