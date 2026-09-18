"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Car, Calendar, MapPin, Search, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CarLocation, CarCategory } from "@/lib/db/schema"

/**
 * Le moteur de recherche rapide de la page d'accueil
 * (booking-engine.tsx::CarForm) envoie des slugs fixes ("tunis-airport",
 * "hammamet"…) qui ne correspondent à aucun id réel de `car_locations`
 * (uuid généré à la création de chaque lieu par l'agence). On ne
 * présélectionne que si on peut faire correspondre le slug à un lieu réel
 * sans ambiguïté (code aéroport IATA ou nom de ville) — jamais une valeur
 * inventée si rien ne correspond.
 */
const AIRPORT_CODE_FROM_HOME: Record<string, string> = {
  "tunis-airport": "TUN",
  "djerba-airport": "DJE",
}
const CITY_FROM_HOME: Record<string, string> = {
  hammamet: "Hammamet",
  sousse: "Sousse",
}

function matchLocation(input: string | undefined, locations: CarLocation[]): string {
  if (!input) return ""
  const code = AIRPORT_CODE_FROM_HOME[input]
  if (code) {
    const byCode = locations.find((l) => l.airportCode === code)
    if (byCode) return byCode.id
  }
  const city = CITY_FROM_HOME[input]
  if (city) {
    const byCity = locations.find((l) => l.city.toLowerCase() === city.toLowerCase())
    if (byCity) return byCity.id
  }
  return ""
}

const CATEGORY_CODE_FROM_HOME: Record<string, string> = {
  economique: "economy",
  compacte: "compact",
  suv: "suv",
  luxe: "premium",
}

function matchCategory(input: string | undefined, categories: CarCategory[]): string {
  if (!input) return ""
  const code = CATEGORY_CODE_FROM_HOME[input]
  if (!code) return ""
  const byCode = categories.find((c) => c.code.toLowerCase() === code)
  return byCode?.id ?? ""
}

interface CarSearchProps {
  locations: CarLocation[]
  categories: CarCategory[]
  initialLocation?: string
  initialPickupDate?: string
  initialReturnDate?: string
  initialCategory?: string
}

export function CarSearch({
  locations,
  categories,
  initialLocation,
  initialPickupDate,
  initialReturnDate,
  initialCategory,
}: CarSearchProps) {
  const router = useRouter()
  const t = useTranslations("Car")
  const [isPending, startTransition] = useTransition()

  const [pickupLocation, setPickupLocation] = useState(() =>
    matchLocation(initialLocation, locations),
  )
  const [dropoffLocation, setDropoffLocation] = useState("")
  const [sameDropoff, setSameDropoff] = useState(true)
  const [pickupDate, setPickupDate] = useState(initialPickupDate ?? "")
  const [pickupTime, setPickupTime] = useState("10:00")
  const [returnDate, setReturnDate] = useState(() =>
    initialPickupDate &&
    initialReturnDate &&
    initialReturnDate < initialPickupDate
      ? ""
      : (initialReturnDate ?? ""),
  )
  const [returnTime, setReturnTime] = useState("10:00")
  const [category, setCategory] = useState(() => matchCategory(initialCategory, categories))

  function handleSearch() {
    if (locations.length === 0) {
      toast.error(t("toastNoLocations"))
      return
    }
    if (!pickupLocation) {
      toast.error(t("toastSelectPickup"))
      return
    }
    if (!pickupDate || !returnDate) {
      toast.error(t("toastSelectDates"))
      return
    }
    if (new Date(returnDate) < new Date(pickupDate)) {
      toast.error(t("toastReturnAfterPickup"))
      return
    }

    const params = new URLSearchParams({
      pickup: pickupLocation,
      dropoff: sameDropoff ? pickupLocation : dropoffLocation || pickupLocation,
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
    })
    if (category) params.set("category", category)

    startTransition(() => {
      router.push(`/car/search?${params.toString()}`)
    })
  }

  const today = new Date().toISOString().split("T")[0]!

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold">{t("title")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {t("pickupLocationLabel")}
          </Label>
          <Select value={pickupLocation} onValueChange={setPickupLocation}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {locations.length === 0 ? (
                <SelectItem value="_" disabled>
                  {t("noLocationAvailable")}
                </SelectItem>
              ) : (
                locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {t("dropoffLocationLabel")}
            </Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sameDropoff}
                onChange={(e) => setSameDropoff(e.target.checked)}
                id="same-dropoff"
                className="h-4 w-4 cursor-pointer rounded border-gray-300"
              />
              <label htmlFor="same-dropoff">{t("sameLocationCheckbox")}</label>
            </div>
          </div>
          {sameDropoff ? (
            <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              {pickupLocation
                ? locations.find((l) => l.id === pickupLocation)?.name
                : t("sameAsPickup")}
            </div>
          ) : (
            <Select value={dropoffLocation} onValueChange={setDropoffLocation}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {t("pickupDateLabel")}
            </Label>
            <Input
              type="date"
              value={pickupDate}
              min={today}
              onChange={(e) => setPickupDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">{t("timeLabel")}</Label>
            <Input
              type="time"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {t("returnDateLabel")}
            </Label>
            <Input
              type="date"
              value={returnDate}
              min={pickupDate || today}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">{t("timeLabel")}</Label>
            <Input
              type="time"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Car className="h-3.5 w-3.5 text-muted-foreground" />
            {t("vehicleCategoryLabel")}
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder={t("allCategories")} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSearch}
          disabled={isPending}
          size="lg"
          className="gap-2 bg-orange-700 hover:bg-orange-800"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {t("searchButton")}
        </Button>
      </div>
    </div>
  )
}
