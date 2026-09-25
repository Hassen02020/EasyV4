"use client"

import { useMemo, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { Search, Calendar, Users } from "lucide-react"
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

const DURATIONS = ["3-5", "6-8", "9-12", "13+"]

/** Generates upcoming months as { value: "YYYY-MM", label: "Mois YYYY" } */
function useUpcomingMonths(count = 18) {
  const locale = useLocale()
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
    const now = new Date()
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      return { value, label: formatter.format(d) }
    })
  }, [locale, count])
}

export function PackageSearch() {
  const router = useRouter()
  const t = useTranslations("Packages")
  const tCommon = useTranslations("Common")
  const [destination, setDestination] = useState("")
  const [duration, setDuration] = useState("")
  const [month, setMonth] = useState("")
  const [travelers, setTravelers] = useState("2")
  const months = useUpcomingMonths()

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
          <DestinationAutocomplete
            module="packages_slug"
            value={destination}
            onChange={setDestination}
            label={tCommon("destination")}
          />
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
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger>
              <SelectValue placeholder={t("allMonths")} />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
