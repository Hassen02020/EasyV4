"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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

const LOCATIONS = [
  { value: "TUN_AIRPORT", label: "Aéroport Tunis-Carthage" },
  { value: "MIR_AIRPORT", label: "Aéroport Monastir" },
  { value: "DJE_AIRPORT", label: "Aéroport Djerba" },
  { value: "SFA_AIRPORT", label: "Aéroport Sfax" },
  { value: "TUNIS_CENTRE", label: "Tunis Centre-Ville" },
  { value: "SOUSSE", label: "Sousse" },
  { value: "HAMMAMET", label: "Hammamet" },
  { value: "NABEUL", label: "Nabeul" },
  { value: "BIZERTE", label: "Bizerte" },
  { value: "GABES", label: "Gabès" },
]

const CATEGORIES = [
  { value: "economy", label: "Économique (Clio, Peugeot 208…)" },
  { value: "compact", label: "Compacte (Golf, Focus…)" },
  { value: "suv", label: "SUV (Duster, Tucson…)" },
  { value: "minivan", label: "Monospace / Van (7 places)" },
  { value: "premium", label: "Premium (BMW, Mercedes…)" },
]

/**
 * Le moteur de recherche rapide de la page d'accueil (booking-engine.tsx
 * ::CarForm) utilise ses propres clés de lieu/catégorie, différentes de
 * celles de cette page (LOCATIONS/CATEGORIES ci-dessus, alignées sur le
 * catalogue réel de location de voiture). On ne fait correspondre que les
 * paires dont le lieu/la catégorie désignent sans ambiguïté la même chose
 * — pas de correspondance approximative entre deux aéroports distincts.
 */
const LOCATION_FROM_HOME: Record<string, string> = {
  "tunis-airport": "TUN_AIRPORT",
  "djerba-airport": "DJE_AIRPORT",
  hammamet: "HAMMAMET",
  sousse: "SOUSSE",
}

const CATEGORY_FROM_HOME: Record<string, string> = {
  economique: "economy",
  compacte: "compact",
  suv: "suv",
  luxe: "premium",
}

export function CarSearch({
  initialLocation,
  initialPickupDate,
  initialReturnDate,
  initialCategory,
}: {
  initialLocation?: string
  initialPickupDate?: string
  initialReturnDate?: string
  initialCategory?: string
} = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [pickupLocation, setPickupLocation] = useState(
    () => LOCATION_FROM_HOME[initialLocation ?? ""] ?? "",
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
  const [category, setCategory] = useState(
    () => CATEGORY_FROM_HOME[initialCategory ?? ""] ?? "",
  )

  function handleSearch() {
    if (!pickupLocation) {
      toast.error("Veuillez sélectionner un lieu de prise en charge.")
      return
    }
    if (!pickupDate || !returnDate) {
      toast.error("Veuillez sélectionner les dates de location.")
      return
    }
    if (new Date(returnDate) < new Date(pickupDate)) {
      toast.error("La date de retour doit être après la date de prise en charge.")
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
      <h2 className="mb-6 text-xl font-semibold">Réserver une voiture</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Lieu de prise en charge
          </Label>
          <Select value={pickupLocation} onValueChange={setPickupLocation}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Lieu de retour
            </Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={sameDropoff}
                onChange={(e) => setSameDropoff(e.target.checked)}
                id="same-dropoff"
                className="h-4 w-4 cursor-pointer rounded border-gray-300"
              />
              <label htmlFor="same-dropoff">Même lieu</label>
            </div>
          </div>
          {sameDropoff ? (
            <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              {pickupLocation
                ? LOCATIONS.find((l) => l.value === pickupLocation)?.label
                : "Identique à la prise en charge"}
            </div>
          ) : (
            <Select value={dropoffLocation} onValueChange={setDropoffLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
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
              Prise en charge
            </Label>
            <Input
              type="date"
              value={pickupDate}
              min={today}
              onChange={(e) => setPickupDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Heure</Label>
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
              Retour
            </Label>
            <Input
              type="date"
              value={returnDate}
              min={pickupDate || today}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Heure</Label>
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
            Catégorie de véhicule
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes catégories" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
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
          Rechercher une voiture
        </Button>
      </div>
    </div>
  )
}
