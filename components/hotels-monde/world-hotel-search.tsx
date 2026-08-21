"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Hotel, Calendar, Users, Search, Loader2 } from "lucide-react"
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
import { POPULAR_DESTINATIONS, matchDestination } from "@/lib/hotels-monde/search-state"

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
  const [isPending, startTransition] = useTransition()

  const [destination, setDestination] = useState(() =>
    matchDestination(initialDestination),
  )
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? "")
  const [checkOut, setCheckOut] = useState(() =>
    initialCheckIn && initialCheckOut && initialCheckOut <= initialCheckIn
      ? ""
      : (initialCheckOut ?? ""),
  )
  const [adults, setAdults] = useState("2")
  const [rooms, setRooms] = useState("1")
  const [stars, setStars] = useState("")

  function handleSearch() {
    if (!destination) {
      toast.error("Veuillez sélectionner une destination.")
      return
    }
    if (!checkIn || !checkOut) {
      toast.error("Veuillez sélectionner les dates d'arrivée et de départ.")
      return
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error("La date de départ doit être après la date d'arrivée.")
      return
    }

    const params = new URLSearchParams({ destination, checkIn, checkOut, adults, rooms })
    if (stars) params.set("stars", stars)

    startTransition(() => {
      router.push(`/hotels-monde/search?${params.toString()}`)
    })
  }

  const today = new Date().toISOString().split("T")[0]!

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold">Trouver un hôtel</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <Label className="flex items-center gap-1.5 text-sm">
            <Hotel className="h-3.5 w-3.5 text-muted-foreground" />
            Destination
          </Label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une destination…" />
            </SelectTrigger>
            <SelectContent>
              {POPULAR_DESTINATIONS.map((d) => (
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
            Arrivée
          </Label>
          <Input
            type="date"
            value={checkIn}
            min={today}
            onChange={(e) => {
              setCheckIn(e.target.value)
              if (checkOut && e.target.value >= checkOut) setCheckOut("")
            }}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Départ
          </Label>
          <Input
            type="date"
            value={checkOut}
            min={checkIn || today}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Adultes
          </Label>
          <Select value={adults} onValueChange={setAdults}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} adulte{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Chambres</Label>
          <Select value={rooms} onValueChange={setRooms}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} chambre{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Catégorie</Label>
          <Select value={stars} onValueChange={setStars}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes catégories" />
            </SelectTrigger>
            <SelectContent>
              {[5, 4, 3, 2, 1].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {"★".repeat(n)} {n} étoile{n > 1 ? "s" : ""}
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
          Rechercher
        </Button>
      </div>
    </div>
  )
}
