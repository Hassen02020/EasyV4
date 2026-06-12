"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Minus,
  Plus,
  ArrowRight,
  Filter,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { ProHotel } from "@/lib/pro/hotels-fixture"
import { BOARDING_LABEL, BOARDING_SHORT } from "@/lib/pro/hotels-fixture"
import type { RoomOffer } from "@/lib/pro/rooms"
import { formatTND } from "@/lib/pro/format"

type Selection = Record<string, number>

interface HotelRoomSelectorProps {
  hotel: ProHotel
  offers: RoomOffer[]
  /** Searchparams reportés depuis la SERP pour conserver dates / pax. */
  context: {
    checkin?: string
    checkout?: string
    nights?: number
    rooms?: number
    adults?: number
    children?: number
  }
}

type FilterTab =
  | "availability"
  | "categories"
  | "arrangements"
  | "boardings"
  | "settings"

const TABS: { id: FilterTab; label: string }[] = [
  { id: "availability", label: "Disponibilité" },
  { id: "categories", label: "Catégories" },
  { id: "arrangements", label: "Arrangements" },
  { id: "boardings", label: "Type de pension" },
  { id: "settings", label: "Paramètres" },
]

export function HotelRoomSelector({
  hotel,
  offers,
  context,
}: HotelRoomSelectorProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [selection, setSelection] = useState<Selection>({})
  const [activeTab, setActiveTab] = useState<FilterTab>("availability")
  const [availableOnly, setAvailableOnly] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(offers.map((o) => o.category.id ?? o.category.name)),
      ).filter((x): x is string => !!x),
    [offers],
  )
  const availableArrangements = useMemo(
    () =>
      Array.from(
        new Set(offers.map((o) => o.arrangement.id ?? o.arrangement.label)),
      ).filter((x): x is string => !!x),
    [offers],
  )
  const availableBoardings = useMemo(
    () => Array.from(new Set(offers.map((o) => o.boarding))),
    [offers],
  )

  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedArrangements, setSelectedArrangements] = useState<string[]>([])
  const [selectedBoardings, setSelectedBoardings] = useState<string[]>([])

  const filteredOffers = useMemo(() => {
    return offers.filter((o) => {
      if (availableOnly && o.available === false) return false
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(o.category.id ?? "")
      )
        return false
      if (
        selectedArrangements.length > 0 &&
        !selectedArrangements.includes(o.arrangement.id ?? "")
      )
        return false
      if (
        selectedBoardings.length > 0 &&
        !selectedBoardings.includes(o.boarding)
      )
        return false
      return true
    })
  }, [
    offers,
    availableOnly,
    selectedCategories,
    selectedArrangements,
    selectedBoardings,
  ])

  const visibleOffers = showAll ? filteredOffers : filteredOffers.slice(0, 6)

  const total = useMemo(() => {
    return Object.entries(selection).reduce((sum, [id, qty]) => {
      const off = offers.find((o) => o.id === id)
      if (!off) return sum
      return sum + off.price * qty
    }, 0)
  }, [selection, offers])

  const selectedRoomsCount = Object.values(selection).reduce(
    (sum, qty) => sum + qty,
    0,
  )

  function toggle(list: string[], item: string): string[] {
    return list.includes(item)
      ? list.filter((x) => x !== item)
      : [...list, item]
  }

  function changeQty(offerId: string, delta: number, max: number) {
    setSelection((prev) => {
      const current = prev[offerId] ?? 0
      const next = Math.max(0, Math.min(max, current + delta))
      const out = { ...prev }
      if (next === 0) {
        delete out[offerId]
      } else {
        out[offerId] = next
      }
      return out
    })
  }

  function handleSubmit() {
    if (selectedRoomsCount === 0) return
    startTransition(() => {
      try {
        const params = new URLSearchParams()
        params.set("hotelId", hotel.id)
        if (context.checkin) params.set("checkin", context.checkin)
        if (context.checkout) params.set("checkout", context.checkout)
        if (context.nights) params.set("nights", String(context.nights))
        if (context.adults) params.set("adults", String(context.adults))
        if (context.children) params.set("children", String(context.children))
        const offersStr = Object.entries(selection)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => `${id}:${qty}`)
          .join(",")
        if (!offersStr) {
          toast.error("Aucune chambre sélectionnée")
          return
        }
        params.set("offers", offersStr)
        router.push(`/pro/booking/travelers?${params.toString()}`)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erreur de navigation — réessayez",
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Tabs filtres */}
      <nav
        aria-label="Filtres de chambres"
        className="bg-card border-border/60 shadow-e2b-soft flex flex-wrap gap-1 rounded-2xl border p-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors",
              activeTab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Panneau du tab actif */}
      <section
        aria-label={`Filtres : ${TABS.find((t) => t.id === activeTab)?.label}`}
        className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4"
      >
        {activeTab === "availability" ? (
          <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5">
            <Checkbox
              checked={availableOnly}
              onCheckedChange={(c) => setAvailableOnly(c === true)}
            />
            <span className="text-sm">
              Afficher uniquement les chambres disponibles
            </span>
          </label>
        ) : activeTab === "categories" ? (
          <CheckboxGrid
            items={availableCategories.map((id) => ({
              id,
              label:
                offers.find((o) => (o.category.id ?? "") === id)?.category
                  .name ?? id,
            }))}
            value={selectedCategories}
            onToggle={(id) => setSelectedCategories((prev) => toggle(prev, id))}
          />
        ) : activeTab === "arrangements" ? (
          <CheckboxGrid
            items={availableArrangements.map((id) => ({
              id,
              label:
                offers.find((o) => (o.arrangement.id ?? "") === id)?.arrangement
                  .label ?? id,
            }))}
            value={selectedArrangements}
            onToggle={(id) =>
              setSelectedArrangements((prev) => toggle(prev, id))
            }
          />
        ) : activeTab === "boardings" ? (
          <CheckboxGrid
            items={availableBoardings.map((id) => ({
              id,
              label: BOARDING_LABEL[id as keyof typeof BOARDING_LABEL] ?? id,
            }))}
            value={selectedBoardings}
            onToggle={(id) => setSelectedBoardings((prev) => toggle(prev, id))}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Période :{" "}
              <span className="text-foreground font-medium">
                {context.checkin ?? "—"} → {context.checkout ?? "—"}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              Voyageurs :{" "}
              <span className="text-foreground font-medium">
                {context.adults ?? 2} adulte
                {(context.adults ?? 2) > 1 ? "s" : ""}
                {context.children
                  ? ` · ${context.children} enfant${context.children > 1 ? "s" : ""}`
                  : ""}
              </span>
            </p>
          </div>
        )}
      </section>

      {/* Tableau des offres */}
      <section
        aria-label="Offres de chambres disponibles"
        className="bg-card border-border/60 shadow-e2b-soft rounded-2xl border"
      >
        <div className="border-border/60 flex items-center justify-between border-b p-4">
          <h3 className="text-foreground inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <Filter className="text-primary h-4 w-4" />
            {filteredOffers.length} offre{filteredOffers.length > 1 ? "s" : ""}
            {!showAll && filteredOffers.length > 6 ? " (6 affichées)" : ""}
          </h3>
          {filteredOffers.length > 6 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAll((s) => !s)}
              className="rounded-lg"
            >
              {showAll ? "Réduire" : "Afficher toutes les offres"}
            </Button>
          ) : null}
        </div>

        {filteredOffers.length === 0 ? (
          <div className="p-10 text-center">
            <Info className="text-muted-foreground mx-auto h-8 w-8" />
            <p className="text-foreground mt-3 text-sm font-semibold">
              Aucune offre ne correspond aux filtres
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-border/60 bg-muted/30 border-b">
                <tr className="text-muted-foreground text-xs tracking-wide uppercase">
                  <th className="px-4 py-3 text-left font-semibold">
                    Catégorie
                  </th>
                  <th className="px-3 py-3 text-left font-semibold">
                    Occupants
                  </th>
                  <th className="px-3 py-3 text-left font-semibold">
                    Arrangement
                  </th>
                  <th className="px-3 py-3 text-left font-semibold">Pension</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-3 py-3 text-left font-semibold">
                    Conditions
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Nombre
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {visibleOffers.map((offer) => {
                  const qty = selection[offer.id] ?? 0
                  const occupants =
                    (offer.arrangement.maxAdults ?? offer.capacity) +
                    (offer.arrangement.maxChildren ?? 0)
                  return (
                    <tr
                      key={offer.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        qty > 0 && "bg-primary/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">
                          {offer.category.name}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {offer.category.description}
                        </div>
                      </td>
                      <td className="text-foreground px-3 py-3 tabular-nums">
                        {occupants} pers.
                      </td>
                      <td className="text-foreground/90 px-3 py-3 text-xs">
                        {offer.arrangement.label}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="border-secondary/40 text-secondary bg-secondary/5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                          title={BOARDING_LABEL[offer.boarding]}
                        >
                          <span className="opacity-70">
                            {BOARDING_SHORT[offer.boarding]}
                          </span>
                          {BOARDING_LABEL[offer.boarding]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="text-primary text-base font-bold tabular-nums">
                          {formatTND(offer.price)}
                        </div>
                      </td>
                      <td className="text-muted-foreground max-w-[180px] px-3 py-3 text-xs leading-snug">
                        {offer.conditions.map((c) => c.label).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            disabled={qty === 0}
                            onClick={() => changeQty(offer.id, -1, 10)}
                            aria-label="Diminuer"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center tabular-nums">
                            {qty}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            disabled={qty >= 10}
                            onClick={() => changeQty(offer.id, +1, 10)}
                            aria-label="Augmenter"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sticky bottom bar */}
      <div
        className={cn(
          "border-border/60 bg-card shadow-e2b-elevated sticky bottom-4 z-30 rounded-2xl border p-3",
          selectedRoomsCount > 0 && "ring-primary/30 ring-2",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                {hotel.name}
              </p>
              <p className="text-foreground text-sm font-semibold">
                {selectedRoomsCount === 0
                  ? "Aucune chambre sélectionnée"
                  : `${selectedRoomsCount} chambre${selectedRoomsCount > 1 ? "s" : ""} sélectionnée${selectedRoomsCount > 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="border-border/60 border-l pl-3">
              <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                Total
              </p>
              <p className="text-primary text-xl font-bold tabular-nums">
                {formatTND(total)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedRoomsCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Prêt à réserver
              </span>
            ) : null}
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={selectedRoomsCount === 0 || pending}
              className="rounded-xl"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Chargement…
                </>
              ) : (
                <>
                  Suivant
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckboxGrid({
  items,
  value,
  onToggle,
}: {
  items: { id: string; label: string }[]
  value: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="grid gap-1 md:grid-cols-2">
      {items.map((item) => (
        <label
          key={item.id}
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1"
        >
          <Checkbox
            checked={value.includes(item.id)}
            onCheckedChange={() => onToggle(item.id)}
          />
          <span className="text-sm">{item.label}</span>
        </label>
      ))}
    </div>
  )
}
