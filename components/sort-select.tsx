"use client"

import { ArrowUpDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SORT_OPTIONS, type HotelSortMode } from "@/lib/mygo/sort"

/**
 * Partagé entre `/hotels/search` (public, traduit) et
 * `components/pro/pro-hotel-results.tsx` (`/pro`, reste français, pas de
 * `NextIntlClientProvider`) — voir le même commentaire détaillé sur
 * `FilterLabels` dans `components/filter-sidebar.tsx`. `labels` optionnel,
 * défaut = texte français d'origine (comportement `/pro` inchangé).
 */
export interface SortSelectLabels {
  ariaLabel: string
  optionLabel: (mode: HotelSortMode) => string
}

const DEFAULT_SORT_OPTION_LABELS: Record<HotelSortMode, string> = Object.fromEntries(
  SORT_OPTIONS.map((opt) => [opt.value, opt.label]),
) as Record<HotelSortMode, string>

export const DEFAULT_SORT_SELECT_LABELS: SortSelectLabels = {
  ariaLabel: "Trier les résultats",
  optionLabel: (mode) => DEFAULT_SORT_OPTION_LABELS[mode],
}

interface SortSelectProps {
  value: HotelSortMode
  onChange: (mode: HotelSortMode) => void
  disabled?: boolean
  labels?: SortSelectLabels
}

export function SortSelect({
  value,
  onChange,
  disabled,
  labels = DEFAULT_SORT_SELECT_LABELS,
}: SortSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as HotelSortMode)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-[220px] gap-2 rounded-full" aria-label={labels.ariaLabel}>
        <ArrowUpDown className="text-muted-foreground size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {labels.optionLabel(opt.value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
