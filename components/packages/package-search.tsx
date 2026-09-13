"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Search, Globe, Calendar, Users } from "lucide-react"
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

const DESTINATIONS = ["istanbul", "dubai", "paris", "rome", "barcelona", "london", "cairo", "casablanca"]

const DURATIONS = ["3-5", "6-8", "9-12", "13+"]

export function PackageSearch() {
  const router = useRouter()
  const t = useTranslations("Packages")
  const tCommon = useTranslations("Common")
  const [destination, setDestination] = useState("")
  const [duration, setDuration] = useState("")
  const [month, setMonth] = useState("")
  const [travelers, setTravelers] = useState("2")

  function handleSearch() {
    const params = new URLSearchParams()
    if (destination) params.set("destination", destination)
    if (duration) params.set("duration", duration)
    if (month) params.set("month", month)
    if (travelers) params.set("travelers", travelers)
    router.push(`/packages?${params.toString()}`)
  }

  return (
    <div className="mb-8 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-lg font-semibold">{t("refineSearch")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {tCommon("destination")}
          </Label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder={t("allDestinations")} />
            </SelectTrigger>
            <SelectContent>
              {DESTINATIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`destinations.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {tCommon("duree")}
          </Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue placeholder={t("allDurations")} />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`durations.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {tCommon("moisDepart")}
          </Label>
          <Input
            type="month"
            value={month}
            min={new Date().toISOString().slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {tCommon("voyageurs")}
          </Label>
          <Select value={travelers} onValueChange={setTravelers}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("travelersCount", { count: n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSearch} className="gap-2">
          <Search className="h-4 w-4" />
          {t("searchButton")}
        </Button>
      </div>
    </div>
  )
}
