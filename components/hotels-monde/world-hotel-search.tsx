"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { Users, Search, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DestinationAutocomplete } from "@/components/destination-autocomplete"
import { DateRangePicker } from "@/components/hotel-search/date-range-picker"
import {
  parseIsoDateLocal,
  formatDateIso,
  isValidStayRange,
} from "@/lib/hotels/date-utils"
import { matchDestination } from "@/lib/hotels-monde/search-state"

export function WorldHotelSearch({
  initialDestination,
  initialCheckIn,
  initialCheckOut,
}: {
  initialDestination?: string
  initialCheckIn?: string
  initialCheckOut?: string
} = {}) {
  const router = useRouter()
  const t = useTranslations("HotelsMonde")
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const [destination, setDestination] = useState(() =>
    matchDestination(initialDestination),
  )
  const initialCheckInDate = parseIsoDateLocal(initialCheckIn)
  const initialCheckOutDate = parseIsoDateLocal(initialCheckOut)
  const [checkIn, setCheckIn] = useState<Date | null>(initialCheckInDate)
  const [checkOut, setCheckOut] = useState<Date | null>(
    initialCheckInDate && initialCheckOutDate && initialCheckOutDate <= initialCheckInDate
      ? null
      : initialCheckOutDate,
  )
  const [adults, setAdults] = useState("2")
  const [rooms, setRooms] = useState("1")
  const [stars, setStars] = useState("")

  function handleSearch() {
    if (!destination) {
      toast.error(t("toastSelectDestination"))
      return
    }
    if (!isValidStayRange({ checkIn, checkOut })) {
      toast.error(t("toastSelectDates"))
      return
    }

    const params = new URLSearchParams({
      destination,
      checkIn: formatDateIso(checkIn!),
      checkOut: formatDateIso(checkOut!),
      adults,
      rooms,
    })
    if (stars) params.set("stars", stars)

    startTransition(() => {
      router.push(`/hotels-monde/search?${params.toString()}`)
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold">{t("findHotelTitle")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <DestinationAutocomplete
            module="hotels_monde_slug"
            value={destination}
            onChange={setDestination}
            label={t("destinationLabel")}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={({ checkIn: nextCheckIn, checkOut: nextCheckOut }) => {
              setCheckIn(nextCheckIn)
              setCheckOut(nextCheckOut)
            }}
            locale={locale}
            label={t("arrivalLabel")}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t("adultsLabel")}
          </Label>
          <Select value={adults} onValueChange={setAdults}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("adultsCountOption", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">{t("roomsLabel")}</Label>
          <Select value={rooms} onValueChange={setRooms}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("roomsCountOption", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">{t("categoryLabel")}</Label>
          <Select value={stars} onValueChange={setStars}>
            <SelectTrigger>
              <SelectValue placeholder={t("allCategories")} />
            </SelectTrigger>
            <SelectContent>
              {[5, 4, 3, 2, 1].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {"★".repeat(n)} {t("starsCountOption", { n })}
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
          className="gap-2 bg-teal-700 hover:bg-teal-800"
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
