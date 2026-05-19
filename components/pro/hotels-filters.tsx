"use client"

import { useId } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type HotelBoarding, BOARDING_LABEL } from "@/lib/pro/hotels-fixture"

export type HotelFiltersState = {
  stars: number[]
  boardings: HotelBoarding[]
  priceMin: number
  priceMax: number
  recommendedOnly: boolean
}

interface HotelsFiltersProps {
  value: HotelFiltersState
  onChange: (next: HotelFiltersState) => void
  priceBounds: { min: number; max: number }
  availableStars: number[]
  availableBoardings: HotelBoarding[]
  onReset: () => void
  resultsCount: number
}

const STAR_LABEL: Record<number, string> = {
  5: "5 étoiles",
  4: "4 étoiles",
  3: "3 étoiles",
  2: "2 étoiles",
  1: "1 étoile",
}

export function HotelsFilters({
  value,
  onChange,
  priceBounds,
  availableStars,
  availableBoardings,
  onReset,
  resultsCount,
}: HotelsFiltersProps) {
  const baseId = useId()

  function toggle<T extends number | string>(list: T[], item: T): T[] {
    return list.includes(item)
      ? list.filter((x) => x !== item)
      : [...list, item]
  }

  return (
    <aside
      className="bg-card border-border/60 shadow-e2b-soft sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border p-4"
      aria-labelledby={`${baseId}-title`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id={`${baseId}-title`}
          className="text-foreground inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase"
        >
          <SlidersHorizontal className="text-primary h-4 w-4" />
          Filtres
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
        >
          <X className="h-3 w-3" />
          Réinitialiser
        </button>
      </div>

      <p className="text-muted-foreground mb-4 text-xs">
        {resultsCount} résultat{resultsCount > 1 ? "s" : ""}
      </p>

      <FilterSection title="Tarifs">
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <Checkbox
            checked={value.recommendedOnly}
            onCheckedChange={(checked) =>
              onChange({ ...value, recommendedOnly: checked === true })
            }
          />
          <span className="text-sm">Recommandés uniquement</span>
        </label>
      </FilterSection>

      <FilterSection title="Catégorie">
        <div className="space-y-1">
          {[5, 4, 3].map((s) => {
            const enabled = availableStars.includes(s)
            const checked = value.stars.includes(s)
            return (
              <label
                key={s}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors",
                  enabled ? "hover:bg-muted/50" : "opacity-40",
                )}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    disabled={!enabled}
                    onCheckedChange={() =>
                      onChange({ ...value, stars: toggle(value.stars, s) })
                    }
                  />
                  <span className="text-sm">{STAR_LABEL[s]}</span>
                </div>
              </label>
            )
          })}
        </div>
      </FilterSection>

      <FilterSection title="Prix (à partir de)">
        <div className="px-1">
          <Slider
            value={[value.priceMin, value.priceMax]}
            min={priceBounds.min}
            max={priceBounds.max}
            step={50}
            onValueChange={([min, max]) =>
              onChange({
                ...value,
                priceMin: min ?? value.priceMin,
                priceMax: max ?? value.priceMax,
              })
            }
            className="mt-3"
          />
          <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs tabular-nums">
            <span>{Math.round(value.priceMin)} DT</span>
            <span>{Math.round(value.priceMax)} DT</span>
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Type de pension">
        <div className="space-y-1">
          {availableBoardings.map((b) => (
            <label
              key={b}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1"
            >
              <Checkbox
                checked={value.boardings.includes(b)}
                onCheckedChange={() =>
                  onChange({ ...value, boardings: toggle(value.boardings, b) })
                }
              />
              <span className="text-sm">{BOARDING_LABEL[b]}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <Button
        type="button"
        variant="outline"
        onClick={onReset}
        className="mt-2 w-full rounded-xl"
      >
        Réinitialiser tous les filtres
      </Button>
    </aside>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-border/40 border-b py-3 last:border-b-0">
      <Label className="text-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </Label>
      <div className="mt-2">{children}</div>
    </section>
  )
}
