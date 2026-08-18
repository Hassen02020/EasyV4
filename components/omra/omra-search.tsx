"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

const MONTHS = [
  { value: "1", label: "Janvier" },
  { value: "2", label: "Février" },
  { value: "3", label: "Mars" },
  { value: "4", label: "Avril" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Juin" },
  { value: "7", label: "Juillet" },
  { value: "8", label: "Août" },
  { value: "9", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
]

// Doit correspondre exactement aux valeurs de l'enum omra_package_type
// (lib/db/schema/omra.ts) — sinon le filtre ne matcherait aucun package réel.
const PROGRAMMES = [
  { value: "omra", label: "Omra" },
  { value: "ramadan", label: "Omra Ramadan" },
  { value: "umrah_plus", label: "Omra + Ziarat étendu" },
  { value: "hajj", label: "Hajj" },
]

export function OmraSearch() {
  const router = useRouter()
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
      <h2 className="mb-6 text-lg font-semibold">Affiner votre recherche</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            Programme
          </Label>
          <Select value={programme} onValueChange={setProgramme}>
            <SelectTrigger>
              <SelectValue placeholder="Tous programmes" />
            </SelectTrigger>
            <SelectContent>
              {PROGRAMMES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Mois de départ
          </Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les mois" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
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
            Pèlerins
          </Label>
          <Select value={pilgrims} onValueChange={setPilgrims}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} pèlerin{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSearch} className="gap-2">
          <Search className="h-4 w-4" />
          Rechercher
        </Button>
      </div>
    </div>
  )
}
