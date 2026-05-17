"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format, addDays, differenceInCalendarDays } from "date-fns"
import { fr } from "date-fns/locale"
import {
  MapPin,
  CalendarRange,
  ChevronDown,
  Users,
  ArrowRight,
  Building2,
  Search,
  Hotel,
  Globe2,
  Minus,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  ALL_DESTINATIONS,
  searchDestinations,
  type Destination,
} from "@/lib/pro/destinations"
import type { ProModule } from "./pro-module-tabs"

interface ProSearchBarProps {
  module: ProModule
}

type Room = {
  adults: number
  children: number
  childrenAges: number[]
}

const PAX_LIMITS = { adults: { min: 1, max: 6 }, children: { min: 0, max: 4 } }

function totalPax(rooms: Room[]) {
  return rooms.reduce((acc, r) => acc + r.adults + r.children, 0)
}

function buildPaxLabel(rooms: Room[]) {
  const adults = rooms.reduce((acc, r) => acc + r.adults, 0)
  const children = rooms.reduce((acc, r) => acc + r.children, 0)
  return `${rooms.length} ch · ${adults} ad${children > 0 ? ` · ${children} enf` : ""}`
}

export function ProSearchBar({ module }: ProSearchBarProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const today = useMemo(() => new Date(), [])
  const [destinationQuery, setDestinationQuery] = useState("")
  const [storedDestination, setDestination] = useState<Destination | null>(
    ALL_DESTINATIONS[0]!,
  )
  const [destOpen, setDestOpen] = useState(false)

  // Une chaîne hôtelière n'est pas pertinente hors module "hotels" : on
  // calcule la destination effective au rendu plutôt qu'en useEffect pour
  // éviter les cascades de re-renders.
  const destination =
    storedDestination && (module === "hotels" || storedDestination.kind !== "chain")
      ? storedDestination
      : ALL_DESTINATIONS[0]!

  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(() => ({
    from: addDays(today, 14),
    to: addDays(today, 18),
  }))
  const [dateOpen, setDateOpen] = useState(false)

  const [rooms, setRooms] = useState<Room[]>([
    { adults: 2, children: 0, childrenAges: [] },
  ])
  const [paxOpen, setPaxOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const filteredDestinations = useMemo(
    () => searchDestinations(destinationQuery),
    [destinationQuery],
  )

  const nights = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return 0
    return Math.max(differenceInCalendarDays(dateRange.to, dateRange.from), 0)
  }, [dateRange])

  function updateRoom(
    index: number,
    field: keyof Pick<Room, "adults" | "children">,
    delta: number,
  ) {
    setRooms((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const next = { ...r }
        const limits = PAX_LIMITS[field]
        const value = Math.min(
          Math.max(r[field] + delta, limits.min),
          limits.max,
        )
        next[field] = value
        if (field === "children") {
          next.childrenAges = Array.from({ length: value }, (_, idx) =>
            r.childrenAges[idx] ?? 5,
          )
        }
        return next
      }),
    )
  }

  function addRoom() {
    setRooms((prev) =>
      prev.length >= 4 ? prev : [...prev, { adults: 2, children: 0, childrenAges: [] }],
    )
  }

  function removeRoom(i: number) {
    setRooms((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function handleSearch() {
    if (!destination) {
      inputRef.current?.focus()
      return
    }
    if (!dateRange.from || !dateRange.to) {
      setDateOpen(true)
      return
    }
    startTransition(() => {
      const params = new URLSearchParams()
      params.set("module", module)
      params.set("destination", destination.id)
      params.set("destinationLabel", destination.label)
      if (destination.cityId) params.set("cityId", String(destination.cityId))
      params.set("checkin", format(dateRange.from!, "yyyy-MM-dd"))
      params.set("checkout", format(dateRange.to!, "yyyy-MM-dd"))
      params.set("nights", String(nights))
      params.set("rooms", String(rooms.length))
      params.set("adults", String(rooms.reduce((a, r) => a + r.adults, 0)))
      params.set("children", String(rooms.reduce((a, r) => a + r.children, 0)))
      const target =
        module === "hotels"
          ? `/pro/hotels?${params.toString()}`
          : `/pro/${module}?${params.toString()}`
      router.push(target)
    })
  }

  return (
    <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-12 md:gap-3">
        <div className="md:col-span-5">
          <Label className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
            Où allez-vous ?
          </Label>
          <Popover open={destOpen} onOpenChange={setDestOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="bg-background border-input ring-offset-background hover:bg-muted/40 focus-visible:ring-ring flex h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <MapPin className="text-primary h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-medium">
                    {destination?.label ?? "Sélectionnez une destination"}
                  </div>
                  {destination?.region ? (
                    <div className="text-muted-foreground truncate text-xs">
                      {destination.region}
                      {destination.country ? ` · ${destination.country}` : ""}
                    </div>
                  ) : null}
                </div>
                <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="rounded-2xl p-0 w-[--radix-popover-trigger-width] min-w-[320px]"
            >
              <div className="border-border/60 border-b p-3">
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    ref={inputRef}
                    placeholder="Ville, région ou chaîne hôtelière"
                    value={destinationQuery}
                    onChange={(e) => setDestinationQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto p-1">
                {filteredDestinations.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-center text-sm">
                    Aucune destination trouvée
                  </p>
                ) : (
                  filteredDestinations.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={cn(
                        "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                        destination?.id === d.id && "bg-primary/10",
                      )}
                      onClick={() => {
                        setDestination(d)
                        setDestOpen(false)
                        setDestinationQuery("")
                      }}
                    >
                      {d.kind === "all" ? (
                        <Globe2 className="text-primary h-4 w-4" />
                      ) : d.kind === "chain" ? (
                        <Building2 className="text-secondary h-4 w-4" />
                      ) : (
                        <Hotel className="text-accent h-4 w-4" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground truncate text-sm font-medium">
                          {d.label}
                        </div>
                        {d.region ? (
                          <div className="text-muted-foreground truncate text-xs">
                            {d.region}
                          </div>
                        ) : null}
                      </div>
                      {typeof d.hotelsCount === "number" ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          ({d.hotelsCount})
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="md:col-span-4">
          <Label className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
            Arrivée — Départ
          </Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="bg-background border-input hover:bg-muted/40 flex h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <CalendarRange className="text-primary h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  {dateRange.from && dateRange.to ? (
                    <>
                      <div className="text-foreground truncate text-sm font-medium">
                        {format(dateRange.from, "dd MMM", { locale: fr })} —{" "}
                        {format(dateRange.to, "dd MMM yyyy", { locale: fr })}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {nights} nuit{nights > 1 ? "s" : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      Choisir vos dates
                    </span>
                  )}
                </div>
                <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="rounded-2xl p-0"
              sideOffset={6}
            >
              <Calendar
                mode="range"
                selected={dateRange as { from: Date; to?: Date }}
                onSelect={(range) =>
                  setDateRange({ from: range?.from, to: range?.to })
                }
                numberOfMonths={2}
                disabled={(date) => date < today}
                locale={fr}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="md:col-span-3">
          <Label className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">
            Chambre & voyageurs
          </Label>
          <Popover open={paxOpen} onOpenChange={setPaxOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="bg-background border-input hover:bg-muted/40 flex h-12 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Users className="text-primary h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-medium">
                    {buildPaxLabel(rooms)}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    Total {totalPax(rooms)} pax
                  </div>
                </div>
                <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="rounded-2xl p-0 w-80">
              <div className="space-y-3 p-4">
                {rooms.map((room, idx) => (
                  <div
                    key={idx}
                    className="border-border/50 rounded-xl border p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-foreground text-sm font-semibold">
                        Chambre {idx + 1}
                      </span>
                      {rooms.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRoom(idx)}
                          className="text-destructive text-xs hover:underline"
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                    <PaxCounter
                      label="Adultes"
                      hint="13 ans et +"
                      value={room.adults}
                      onDec={() => updateRoom(idx, "adults", -1)}
                      onInc={() => updateRoom(idx, "adults", +1)}
                      min={PAX_LIMITS.adults.min}
                      max={PAX_LIMITS.adults.max}
                    />
                    <PaxCounter
                      label="Enfants"
                      hint="2 — 12 ans"
                      value={room.children}
                      onDec={() => updateRoom(idx, "children", -1)}
                      onInc={() => updateRoom(idx, "children", +1)}
                      min={PAX_LIMITS.children.min}
                      max={PAX_LIMITS.children.max}
                    />
                  </div>
                ))}
                {rooms.length < 4 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRoom}
                    className="w-full rounded-xl"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Ajouter une chambre
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          {module === "hotels"
            ? "Sélectionnez votre destination + dates pour afficher les disponibilités hôtelières."
            : module === "transfer"
              ? "Le module Transfert sera disponible dans une prochaine étape — recherche en mode aperçu."
              : module === "activities"
                ? "Le module Activités sera disponible dans une prochaine étape — recherche en mode aperçu."
                : "Le module Formules (forfaits combinés) sera disponible dans une prochaine étape."}
        </p>
        <Button
          type="button"
          onClick={handleSearch}
          disabled={pending}
          size="lg"
          className="rounded-xl"
        >
          {pending ? "Recherche…" : "Suivant"}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function PaxCounter({
  label,
  hint,
  value,
  onDec,
  onInc,
  min,
  max,
}: {
  label: string
  hint: string
  value: number
  onDec: () => void
  onInc: () => void
  min: number
  max: number
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <div className="text-foreground text-sm">{label}</div>
        <div className="text-muted-foreground text-xs">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onDec}
          disabled={value <= min}
          className="h-8 w-8 rounded-full"
          aria-label={`Diminuer ${label}`}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center tabular-nums text-sm font-medium">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onInc}
          disabled={value >= max}
          className="h-8 w-8 rounded-full"
          aria-label={`Augmenter ${label}`}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
