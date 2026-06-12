"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plane, Calendar, Users, ArrowRight, ArrowLeftRight, Loader2 } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const AIRPORTS = [
  { code: "TUN", label: "Tunis–Carthage (TUN)" },
  { code: "SFA", label: "Sfax–Thyna (SFA)" },
  { code: "TOE", label: "Tozeur–Nefta (TOE)" },
  { code: "MIR", label: "Monastir Habib Bourguiba (MIR)" },
  { code: "DJE", label: "Djerba–Zarzis (DJE)" },
  { code: "CDG", label: "Paris Charles de Gaulle (CDG)" },
  { code: "ORY", label: "Paris Orly (ORY)" },
  { code: "LYS", label: "Lyon Saint-Exupéry (LYS)" },
  { code: "FCO", label: "Rome Fiumicino (FCO)" },
  { code: "IST", label: "Istanbul (IST)" },
  { code: "DXB", label: "Dubaï (DXB)" },
]

const CABIN_CLASSES = [
  { value: "ECONOMY", label: "Économique" },
  { value: "PREMIUM_ECONOMY", label: "Économique Premium" },
  { value: "BUSINESS", label: "Affaires" },
  { value: "FIRST", label: "Première" },
]

export function FlightSearch() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tripType, setTripType] = useState<"oneway" | "roundtrip">("roundtrip")
  const [origin, setOrigin] = useState("TUN")
  const [destination, setDestination] = useState("")
  const [departureDate, setDepartureDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [adults, setAdults] = useState("1")
  const [children, setChildren] = useState("0")
  const [cabin, setCabin] = useState("ECONOMY")

  function swapAirports() {
    const tmp = origin
    setOrigin(destination)
    setDestination(tmp)
  }

  function handleSearch() {
    if (!origin || !destination) {
      toast.error("Veuillez sélectionner les aéroports de départ et d'arrivée.")
      return
    }
    if (origin === destination) {
      toast.error("L'aéroport de départ et d'arrivée doivent être différents.")
      return
    }
    if (!departureDate) {
      toast.error("Veuillez sélectionner une date de départ.")
      return
    }
    if (tripType === "roundtrip" && !returnDate) {
      toast.error("Veuillez sélectionner une date de retour.")
      return
    }

    const params = new URLSearchParams({
      origin,
      destination,
      departureDate,
      adults,
      children,
      cabin,
    })
    if (tripType === "roundtrip" && returnDate) {
      params.set("returnDate", returnDate)
    }

    startTransition(() => {
      router.push(`/vols/search?${params.toString()}`)
    })
  }

  const today = new Date().toISOString().split("T")[0]!

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <Tabs
        value={tripType}
        onValueChange={(v) => setTripType(v as "oneway" | "roundtrip")}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="roundtrip" className="gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Aller-Retour
          </TabsTrigger>
          <TabsTrigger value="oneway" className="gap-1.5">
            <ArrowRight className="h-3.5 w-3.5" />
            Aller Simple
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
            Départ
          </Label>
          <div className="relative">
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger>
                <SelectValue placeholder="Aéroport de départ" />
              </SelectTrigger>
              <SelectContent>
                {AIRPORTS.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Plane className="h-3.5 w-3.5 rotate-180 text-muted-foreground" />
            Arrivée
          </Label>
          <div className="relative">
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger>
                <SelectValue placeholder="Aéroport d'arrivée" />
              </SelectTrigger>
              <SelectContent>
                {AIRPORTS.filter((a) => a.code !== origin).map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={swapAirports}
              className="absolute -left-5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-background p-1 shadow-sm transition-colors hover:bg-muted sm:block"
              title="Inverser"
            >
              <ArrowLeftRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Date de départ
          </Label>
          <Input
            type="date"
            value={departureDate}
            min={today}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
        </div>

        {tripType === "roundtrip" && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Date de retour
            </Label>
            <Input
              type="date"
              value={returnDate}
              min={departureDate || today}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Passagers
          </Label>
          <div className="flex gap-2">
            <Select value={adults} onValueChange={setAdults}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} adulte{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={children} onValueChange={setChildren}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} enfant{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Classe</Label>
          <Select value={cabin} onValueChange={setCabin}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CABIN_CLASSES.map((c) => (
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
          className="gap-2 bg-sky-700 hover:bg-sky-800"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plane className="h-4 w-4" />
          )}
          Rechercher des vols
        </Button>
      </div>
    </div>
  )
}
