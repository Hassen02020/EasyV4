"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
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

export function TransferSearch({ zones }: Props) {
  const router = useRouter()
  const t = useTranslations("Transferts")
  const VEHICLES = [
    { value: "sedan", label: t("vehicleSedan"), icon: "🚗" },
    { value: "van", label: t("vehicleVan"), icon: "🚐" },
    { value: "minibus", label: t("vehicleMinibus"), icon: "🚌" },
    { value: "bus", label: t("vehicleBus"), icon: "🚍" },
    { value: "luxury", label: t("vehicleLuxury"), icon: "🏎️" },
  ]
  const [isPending, startTransition] = useTransition()

  const [fromZone, setFromZone] = useState("")
  const [toZone, setToZone] = useState("")
  const [vehicle, setVehicle] = useState("sedan")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("10:00")
  const [pax, setPax] = useState("2")

  function handleSearch() {
    if (!fromZone || !toZone) {
      toast.error(t("toastSelectZones"))
      return
    }
    if (!date) {
      toast.error(t("toastSelectDate"))
      return
    }
    if (fromZone === toZone) {
      toast.error(t("toastSameZones"))
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
      <h2 className="mb-6 text-xl font-semibold">{t("title")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Car className="h-3.5 w-3.5 text-muted-foreground" />
            {t("pickupLocationLabel")}
          </Label>
          <Select value={fromZone} onValueChange={setFromZone}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectZonePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {zones.length === 0 ? (
                <SelectItem value="_" disabled>
                  {t("noZoneAvailable")}
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
            {t("dropoffLocationLabel")}
          </Label>
          <Select value={toZone} onValueChange={setToZone}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectZonePlaceholder")} />
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
            {t("vehicleTypeLabel")}
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
            {t("passengersCountLabel")}
          </Label>
          <Select value={pax} onValueChange={setPax}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("passengersCountOption", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {t("dateLabel")}
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
            {t("pickupTimeLabel")}
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
          {t("searchButton")}
        </Button>
      </div>
    </div>
  )
}
