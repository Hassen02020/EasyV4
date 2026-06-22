"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Calendar, Users, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

const FORMULES = [
  { value: "moyasara", label: "Moyasara — Économique" },
  { value: "al_haram", label: "Al-Haram — Confort" },
  { value: "abraj_premium", label: "Abraj — Premium" },
  { value: "vip_exclusive", label: "VIP Exclusive" },
]

const ALL = "all"

function buildMonths(): { value: string; label: string }[] {
  const months = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ]
  const now = new Date()
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push({
      value: String(d.getMonth() + 1),
      label: `${months[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return out
}

interface Props {
  defaultFormule?: string
  defaultMonth?: string
  defaultPilgrims?: string
}

export function OmraSearch({
  defaultFormule,
  defaultMonth,
  defaultPilgrims,
}: Props) {
  const router = useRouter()
  const [formule, setFormule] = useState(defaultFormule ?? ALL)
  const [month, setMonth] = useState(defaultMonth ?? ALL)
  const [pilgrims, setPilgrims] = useState(defaultPilgrims ?? "2")
  const months = buildMonths()

  function handleSearch() {
    const params = new URLSearchParams()
    if (formule && formule !== ALL) params.set("formule", formule)
    if (month && month !== ALL) params.set("month", month)
    if (pilgrims) params.set("pilgrims", pilgrims)
    const qs = params.toString()
    router.push(qs ? `/omra?${qs}` : "/omra")
  }

  return (
    <div className="rounded-2xl bg-white p-3 shadow-xl sm:p-4">
      <div className="grid gap-3 md:grid-cols-[1.4fr_1.2fr_0.9fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            Formule
          </Label>
          <Select value={formule} onValueChange={setFormule}>
            <SelectTrigger className="h-12 text-gray-900">
              <SelectValue placeholder="Toutes les formules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les formules</SelectItem>
              {FORMULES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Calendar className="h-3.5 w-3.5 text-emerald-600" />
            Quand voulez-vous partir ?
          </Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-12 text-gray-900">
              <SelectValue placeholder="Mois de départ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les mois</SelectItem>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
            Pèlerins
          </Label>
          <Select value={pilgrims} onValueChange={setPilgrims}>
            <SelectTrigger className="h-12 text-gray-900">
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

        <Button
          onClick={handleSearch}
          size="lg"
          className="h-12 gap-2 bg-emerald-600 px-8 hover:bg-emerald-700"
        >
          <Search className="h-4 w-4" />
          Rechercher
        </Button>
      </div>
    </div>
  )
}
