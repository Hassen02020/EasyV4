"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Users, Star, X, Plus, Minus, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  DestinationCombobox,
  type DestinationOption,
} from "@/components/search/destination-combobox"
import { StayDatePicker, type StayValue } from "@/components/search/stay-date-picker"

const STAR_OPTIONS = [
  { value: 5, label: "5 Etoiles" },
  { value: 4, label: "4 Etoiles" },
  { value: 3, label: "3 Etoiles" },
  { value: 2, label: "2 Etoiles" },
]

export function HotelsTunisieSearch() {
  const router = useRouter()

  const [selectedCity, setSelectedCity] = useState<DestinationOption | null>(
    null,
  )
  const [stay, setStay] = useState<StayValue>({})

  // Pax state
  const [adults, setAdults] = useState(2)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [paxPopoverOpen, setPaxPopoverOpen] = useState(false)

  // Filters state
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [selectedStars, setSelectedStars] = useState<number[]>([])
  const [starsPopoverOpen, setStarsPopoverOpen] = useState(false)

  const isFormValid = Boolean(selectedCity && stay.checkIn && stay.checkOut)

  const handleSearch = () => {
    if (!selectedCity || !stay.checkIn || !stay.checkOut) return

    const params = new URLSearchParams({
      cityId: selectedCity.value,
      city: selectedCity.label,
      checkin: format(stay.checkIn, "yyyy-MM-dd"),
      checkout: format(stay.checkOut, "yyyy-MM-dd"),
      adults: String(adults),
    })
    if (childrenAges.length > 0) {
      params.set("children", childrenAges.join(","))
    }
    if (selectedStars.length > 0) {
      params.set("stars", selectedStars.join(","))
    }
    if (onlyAvailable) {
      params.set("onlyAvailable", "1")
    }

    router.push(`/hotels/search?${params.toString()}`)
  }

  // Children management
  const addChild = () => {
    if (childrenAges.length < 4) {
      setChildrenAges([...childrenAges, 5])
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

  const toggleStar = (star: number) => {
    if (selectedStars.includes(star)) {
      setSelectedStars(selectedStars.filter((s) => s !== star))
    } else {
      setSelectedStars([...selectedStars, star].sort((a, b) => b - a))
    }
  }

  // Pax display
  const paxDisplay = useMemo(() => {
    const parts: string[] = []
    parts.push(`${adults} Adulte${adults > 1 ? "s" : ""}`)
    if (childrenAges.length > 0) {
      parts.push(
        `${childrenAges.length} Enfant${childrenAges.length > 1 ? "s" : ""}`,
      )
    }
    return parts.join(", ")
  }, [adults, childrenAges])

  return (
    <div className="space-y-5">
      {/* Main Search Row */}
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* City Autocomplete */}
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Destination
          </label>
          <DestinationCombobox
            scope="tunisie"
            value={selectedCity}
            onChange={setSelectedCity}
          />
        </div>

        {/* Date Range Picker (avec nombre de nuits) */}
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Dates du séjour
          </label>
          <StayDatePicker value={stay} onChange={setStay} />
        </div>

        {/* Pax Selector */}
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Voyageurs
          </label>
          <Popover open={paxPopoverOpen} onOpenChange={setPaxPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-12 w-full justify-start rounded-3xl px-4 text-left font-normal"
              >
                <Users className="text-muted-foreground mr-2 size-4 shrink-0" />
                <span className="truncate">{paxDisplay}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-4" align="start">
              <div className="space-y-4">
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
                    <p className="text-muted-foreground text-xs">0-17 ans</p>
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

                {/* Children Age Selectors */}
                {childrenAges.length > 0 && (
                  <div className="border-muted space-y-2 border-l-2 pl-2">
                    {childrenAges.map((age, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-muted-foreground w-16 text-sm">
                          Enfant {index + 1}
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
        <div className="flex items-end">
          <Button
            onClick={handleSearch}
            disabled={!isFormValid}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-e2b-soft h-12 w-full rounded-3xl px-8 text-base font-semibold transition-all hover:shadow-xl lg:w-auto"
          >
            <Search className="mr-2 size-5" />
            RECHERCHER
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
                  aria-label={`Retirer ${star} étoiles`}
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
