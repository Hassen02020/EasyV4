"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, Star } from "lucide-react"
import type { HotelFacets, HotelFilterState } from "@/lib/mygo/facets"
import { EMPTY_FILTER_STATE } from "@/lib/mygo/facets"

interface FilterSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border-border border-b pb-4"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-2 text-left">
        <h3 className="text-primary text-sm font-semibold">{title}</h3>
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface CheckboxItemProps {
  id: string
  label: React.ReactNode
  count: number
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function CheckboxItem({
  id,
  label,
  count,
  checked,
  onCheckedChange,
}: CheckboxItemProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange?.(Boolean(v))}
        />
        <label
          htmlFor={id}
          className="text-foreground hover:text-primary cursor-pointer truncate text-sm transition-colors"
        >
          {label}
        </label>
      </div>
      <span className="text-muted-foreground shrink-0 text-sm">({count})</span>
    </div>
  )
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: stars }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  )
}

interface FilterSidebarProps {
  facets: HotelFacets | null
  state: HotelFilterState
  onChange: (next: HotelFilterState) => void
  /** Devise (TND par défaut) — affichée en suffixe du curseur de prix. */
  currency?: string
  /** Désactive l'interaction si true (ex. pendant le loading). */
  disabled?: boolean
}

export function FilterSidebar({
  facets,
  state,
  onChange,
  currency = "TND",
  disabled = false,
}: FilterSidebarProps) {
  const priceMin = facets?.priceMin ?? 0
  const priceMax = facets?.priceMax ?? 1000
  const currentRange = state.priceRange ?? [priceMin, priceMax]

  const toggleStars = (star: number) => {
    const next = state.stars.includes(star)
      ? state.stars.filter((s) => s !== star)
      : [...state.stars, star]
    onChange({ ...state, stars: next })
  }
  const toggleBoarding = (name: string) => {
    const next = state.boardings.includes(name)
      ? state.boardings.filter((b) => b !== name)
      : [...state.boardings, name]
    onChange({ ...state, boardings: next })
  }
  const toggleFacility = (title: string) => {
    const next = state.facilities.includes(title)
      ? state.facilities.filter((f) => f !== title)
      : [...state.facilities, title]
    onChange({ ...state, facilities: next })
  }

  const handleReset = () => onChange(EMPTY_FILTER_STATE)

  return (
    <aside
      className="bg-card border-border sticky top-20 rounded-lg border p-5"
      aria-busy={disabled}
    >
      <h2 className="text-primary mb-5 text-lg font-bold">
        Affinez vos résultats
      </h2>

      <div className="space-y-4">
        {/* Tarifs et disponibilités */}
        <FilterSection title="Tarifs et disponibilités">
          <CheckboxItem
            id="recommended"
            label="Hôtel recommandé"
            count={facets?.recommendedCount ?? 0}
            checked={state.recommendedOnly}
            onCheckedChange={(v) => onChange({ ...state, recommendedOnly: v })}
          />
          <CheckboxItem
            id="available"
            label="Disponible seulement"
            count={facets?.availableCount ?? 0}
            checked={state.availableOnly}
            onCheckedChange={(v) => onChange({ ...state, availableOnly: v })}
          />
          <CheckboxItem
            id="free-cancel"
            label="Annulation gratuite"
            count={facets?.freeCancellationCount ?? 0}
            checked={state.freeCancellationOnly}
            onCheckedChange={(v) =>
              onChange({ ...state, freeCancellationOnly: v })
            }
          />
        </FilterSection>

        {/* Catégorie (Star Rating) */}
        {(facets?.stars.length ?? 0) > 0 && (
          <FilterSection title="Catégorie">
            <div className="space-y-3">
              {facets!.stars.map(({ value, count }) => (
                <div key={value} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`stars-${value}`}
                      checked={state.stars.includes(value)}
                      onCheckedChange={() => toggleStars(value)}
                    />
                    <label
                      htmlFor={`stars-${value}`}
                      className="cursor-pointer"
                    >
                      <StarRating stars={value} />
                    </label>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    ({count})
                  </span>
                </div>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Prix par nuit */}
        {priceMax > priceMin && (
          <FilterSection title={`Prix (${currency})`}>
            <div className="px-1">
              <Slider
                value={[currentRange[0], currentRange[1]]}
                onValueChange={(values) => {
                  const [min, max] = values as [number, number]
                  onChange({ ...state, priceRange: [min, max] })
                }}
                min={priceMin}
                max={priceMax}
                step={Math.max(10, Math.round((priceMax - priceMin) / 50))}
                className="w-full"
                disabled={disabled}
              />
              <div className="text-muted-foreground mt-2 flex justify-between text-sm">
                <span>
                  {currentRange[0].toLocaleString("fr-FR")} {currency}
                </span>
                <span>
                  {currentRange[1].toLocaleString("fr-FR")} {currency}
                </span>
              </div>
            </div>
          </FilterSection>
        )}

        {/* Type de pension */}
        {(facets?.boardings.length ?? 0) > 0 && (
          <FilterSection title="Type de pension">
            {facets!.boardings.map(({ name, count }) => (
              <CheckboxItem
                key={name}
                id={`boarding-${name}`}
                label={name}
                count={count}
                checked={state.boardings.includes(name)}
                onCheckedChange={() => toggleBoarding(name)}
              />
            ))}
          </FilterSection>
        )}

        {/* Équipements */}
        {(facets?.facilities.length ?? 0) > 0 && (
          <FilterSection title="Équipements" defaultOpen={false}>
            {facets!.facilities.map(({ title, count }) => (
              <CheckboxItem
                key={title}
                id={`facility-${title}`}
                label={title}
                count={count}
                checked={state.facilities.includes(title)}
                onCheckedChange={() => toggleFacility(title)}
              />
            ))}
          </FilterSection>
        )}
      </div>

      {/* Reset Filters Button */}
      <button
        type="button"
        onClick={handleReset}
        className="text-primary border-primary hover:bg-primary/5 mt-5 w-full rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
        disabled={disabled}
      >
        Réinitialiser les filtres
      </button>
    </aside>
  )
}
