"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Search, Loader2, Users, BedDouble, Star } from "lucide-react"
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
import {
  DestinationCombobox,
  type DestinationOption,
} from "@/components/search/destination-combobox"
import { StayDatePicker, type StayValue } from "@/components/search/stay-date-picker"

interface WorldHotelSearchProps {
  initialDestination?: DestinationOption | null
}

export function WorldHotelSearch({
  initialDestination = null,
}: WorldHotelSearchProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [destination, setDestination] = useState<DestinationOption | null>(
    initialDestination,
  )
  const [stay, setStay] = useState<StayValue>({})
  const [adults, setAdults] = useState("2")
  const [rooms, setRooms] = useState("1")
  const [stars, setStars] = useState("")

  function handleSearch() {
    if (!destination) {
      toast.error("Veuillez sélectionner une destination.")
      return
    }
    if (!stay.checkIn || !stay.checkOut) {
      toast.error("Veuillez sélectionner les dates d'arrivée et de départ.")
      return
    }

    const params = new URLSearchParams({
      destination: destination.value,
      label: `${destination.label}, ${destination.sublabel ?? ""}`.trim(),
      checkIn: format(stay.checkIn, "yyyy-MM-dd"),
      checkOut: format(stay.checkOut, "yyyy-MM-dd"),
      adults,
      rooms,
    })
    if (stars) params.set("stars", stars)

    startTransition(() => {
      router.push(`/hotels-monde/search?${params.toString()}`)
    })
  }

  return (
    <div className="bg-card rounded-2xl border p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold">Trouver un hôtel</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <Label className="text-sm">Destination</Label>
          <DestinationCombobox
            scope="monde"
            value={destination}
            onChange={setDestination}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label className="text-sm">Dates du séjour</Label>
          <StayDatePicker value={stay} onChange={setStay} />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="text-muted-foreground h-3.5 w-3.5" />
            Adultes
          </Label>
          <Select value={adults} onValueChange={setAdults}>
            <SelectTrigger className="h-12 rounded-3xl">
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
          <Label className="flex items-center gap-1.5 text-sm">
            <BedDouble className="text-muted-foreground h-3.5 w-3.5" />
            Chambres
          </Label>
          <Select value={rooms} onValueChange={setRooms}>
            <SelectTrigger className="h-12 rounded-3xl">
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
          <Label className="flex items-center gap-1.5 text-sm">
            <Star className="text-muted-foreground h-3.5 w-3.5" />
            Catégorie
          </Label>
          <Select value={stars} onValueChange={setStars}>
            <SelectTrigger className="h-12 rounded-3xl">
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
          className="gap-2 rounded-3xl bg-teal-700 hover:bg-teal-800"
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
