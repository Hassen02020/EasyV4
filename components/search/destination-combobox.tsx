"use client"

import { useMemo, useState } from "react"
import { Check, Globe, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCities } from "@/hooks/use-cities"
import {
  WORLD_DESTINATIONS,
  formatWorldDestination,
} from "@/lib/hotels/world-destinations"

export interface DestinationOption {
  /** Tunisie : id ville (string) — Monde : slug destination. */
  value: string
  label: string
  sublabel?: string
  group: string
}

interface DestinationComboboxProps {
  scope: "tunisie" | "monde"
  value: DestinationOption | null
  onChange: (option: DestinationOption | null) => void
  triggerClassName?: string
  placeholder?: string
  searchPlaceholder?: string
}

export function DestinationCombobox({
  scope,
  value,
  onChange,
  triggerClassName,
  placeholder,
  searchPlaceholder,
}: DestinationComboboxProps) {
  const [open, setOpen] = useState(false)
  const { cities, loading, error } = useCities()

  const groups = useMemo(() => {
    if (scope === "tunisie") {
      return [
        {
          heading: "Zones touristiques",
          options: cities.map<DestinationOption>((c) => ({
            value: String(c.id),
            label: c.name,
            sublabel: c.region,
            group: "Zones touristiques",
          })),
        },
      ]
    }
    const byRegion = new Map<string, DestinationOption[]>()
    for (const d of WORLD_DESTINATIONS) {
      const opt: DestinationOption = {
        value: d.value,
        label: d.city,
        sublabel: d.country,
        group: d.region,
      }
      const list = byRegion.get(d.region) ?? []
      list.push(opt)
      byRegion.set(d.region, list)
    }
    return Array.from(byRegion.entries()).map(([heading, options]) => ({
      heading,
      options,
    }))
  }, [scope, cities])

  const Icon = scope === "tunisie" ? MapPin : Globe

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-12 w-full justify-start gap-2 rounded-3xl px-4 text-left font-normal",
            triggerClassName,
          )}
        >
          <Icon className="text-muted-foreground size-4 shrink-0" />
          {value ? (
            <span className="truncate">
              {value.label}
              {value.sublabel && (
                <span className="text-muted-foreground ml-1">
                  ({value.sublabel})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground truncate">
              {placeholder ??
                (scope === "tunisie"
                  ? "Rechercher une ville…"
                  : "Ville, pays ou destination…")}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] max-w-[95vw] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder ??
              (scope === "tunisie"
                ? "Rechercher une ville…"
                : "Tapez une ville ou un pays…")
            }
          />
          <CommandList>
            <CommandEmpty>
              {scope === "tunisie" && loading
                ? "Chargement…"
                : scope === "tunisie" && error
                  ? `Erreur de chargement (${error})`
                  : "Aucune destination trouvée."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.options.map((opt) => (
                  <CommandItem
                    key={`${opt.group}-${opt.value}`}
                    value={`${opt.label} ${opt.sublabel ?? ""}`}
                    onSelect={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                  >
                    <Icon className="text-muted-foreground mr-2 size-4 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-muted-foreground ml-auto truncate pl-2 text-xs">
                        {opt.sublabel}
                      </span>
                    )}
                    {value?.value === opt.value &&
                      value?.group === opt.group && (
                        <Check className="text-primary ml-2 size-4 shrink-0" />
                      )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { formatWorldDestination }
