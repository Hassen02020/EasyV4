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

interface SortSelectProps {
  value: HotelSortMode
  onChange: (mode: HotelSortMode) => void
  disabled?: boolean
}

export function SortSelect({ value, onChange, disabled }: SortSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as HotelSortMode)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-[220px] gap-2 rounded-full" aria-label="Trier les résultats">
        <ArrowUpDown className="text-muted-foreground size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
