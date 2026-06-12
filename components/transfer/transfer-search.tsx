"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Car, Calendar, Clock, Users, ArrowRight, Loader2 } from "lucide-react"
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
import type { CatalogTransferZone } from "@/lib/db/schema"

interface Props {
  zones: CatalogTransferZone[]
}

const VEHICLES = [
  { value: "sedan", label: "Berline (1–3 pax)", icon: "🚗" },
  { value: "van", label: "Van (4–7 pax)", icon: "🚐" },
  { value: "minibus", label: "Minibus (8–16 pax)", icon: "🚌" },
  { value: "bus", label: "Bus (17–50 pax)", icon: "🚍" },
  { value: "luxury", label: "Voiture de luxe", icon: "🏎️" },
]

export function TransferSearch({ zones }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [fromZone, setFromZone] = useState("")
  const [toZone, setToZone] = useState("")
  const [vehicle, setVehicle] = useState("sedan")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("10:00")
  const [pax, setPax] = useState("2")

  function handleSearch() {
    if (!fromZone || !toZone) {
      toast.error("Veuillez sélectionner le lieu de prise en charge et de dépose.")
      return
    }
    if (!date) {
      toast.error("Veuillez sélectionner une date.")
      return
    }
    if (fromZone === toZone) {
      toast.error("Le lieu de départ et d'arrivée doivent être différents.")
      return
    }

    const params = new URLSearchParams({
      from: fromZone,
      to: toZone,
      vehicle,
      date,
      time,
      pax,
    })

    startTransition(() => {
      router.push(`/transferts/resultats?${params.toString()}`)
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold">Réserver un transfert</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Car className="h-3.5 w-3.5 text-muted-foreground" />
            Lieu de prise en charge
          </Label>
          <Select value={fromZone} onValueChange={setFromZone}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une zone…" />
            </SelectTrigger>
            <SelectContent>
              {zones.length === 0 ? (
                <SelectItem value="_" disabled>
                  Aucune zone disponible
                </SelectItem>
              ) : (
                zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            Lieu de dépose
          </Label>
          <Select value={toZone} onValueChange={setToZone}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une zone…" />
            </SelectTrigger>
            <SelectContent>
              {zones
                .filter((z) => z.id !== fromZone)
                .map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Car className="h-3.5 w-3.5 text-muted-foreground" />
            Type de véhicule
          </Label>
          <Select value={vehicle} onValueChange={setVehicle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEHICLES.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.icon} {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Nombre de passagers
          </Label>
          <Select value={pax} onValueChange={setPax}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} passager{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Date
          </Label>
          <Input
            type="date"
            value={date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Heure de prise en charge
          </Label>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSearch}
          disabled={isPending}
          size="lg"
          className="gap-2"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Car className="h-4 w-4" />
          )}
          Rechercher un transfert
        </Button>
      </div>
    </div>
  )
}
