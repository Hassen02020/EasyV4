"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Search, Calendar, Users, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]

// Doit correspondre exactement aux valeurs de l'enum omra_package_type
// (lib/db/schema/omra.ts) — sinon le filtre ne matcherait aucun package réel.
const PROGRAMMES = ["omra", "ramadan", "umrah_plus", "hajj"]

export function OmraSearch() {
  const router = useRouter()
  const t = useTranslations("Omra")
  const tCommon = useTranslations("Common")
  const [programme, setProgramme] = useState("")
  const [month, setMonth] = useState("")
  const [pilgrims, setPilgrims] = useState("2")

  function handleSearch() {
    const params = new URLSearchParams()
    if (programme) params.set("programme", programme)
    if (month) params.set("month", month)
    if (pilgrims) params.set("pilgrims", pilgrims)
    router.push(`/omra?${params.toString()}`)
  }

  return (
    <div className="mb-8 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-lg font-semibold">{t("refineSearch")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            {tCommon("programme")}
          </Label>
          <Select value={programme} onValueChange={setProgramme}>
            <SelectTrigger>
              <SelectValue placeholder={t("allProgrammes")} />
            </SelectTrigger>
            <SelectContent>
              {PROGRAMMES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`filterProgrammes.${p}`)}
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
              {MONTHS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`months.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {t("pilgrimsLabel")}
          </Label>
          <Select value={pilgrims} onValueChange={setPilgrims}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("pilgrimsCount", { count: n })}
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
