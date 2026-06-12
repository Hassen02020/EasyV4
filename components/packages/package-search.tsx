"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

const DESTINATIONS = [
  { value: "istanbul", label: "Istanbul" },
  { value: "dubai", label: "Dubaï" },
  { value: "paris", label: "Paris" },
  { value: "rome", label: "Rome" },
  { value: "barcelona", label: "Barcelone" },
  { value: "london", label: "Londres" },
  { value: "cairo", label: "Le Caire" },
  { value: "casablanca", label: "Casablanca" },
]

const DURATIONS = [
  { value: "3-5", label: "3 à 5 jours" },
  { value: "6-8", label: "6 à 8 jours" },
  { value: "9-12", label: "9 à 12 jours" },
  { value: "13+", label: "13 jours et plus" },
]

export function PackageSearch() {
  const router = useRouter()
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
      <h2 className="mb-6 text-lg font-semibold">Trouver votre voyage</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            Destination
          </Label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes destinations" />
            </SelectTrigger>
            <SelectContent>
              {DESTINATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Durée
          </Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes durées" />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
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
            Voyageurs
          </Label>
          <Select value={travelers} onValueChange={setTravelers}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} voyageur{n > 1 ? "s" : ""}
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
