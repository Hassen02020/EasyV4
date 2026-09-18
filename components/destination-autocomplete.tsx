"use client"

/**
 * Chantier 3 (Phase Premium 2) — composant d'autocomplete de destination
 * partagé, calqué sur le pattern déjà éprouvé de
 * components/hotels-tunisie-search.tsx (Popover + cmdk Command, seul
 * pattern déjà accessible avec un vrai role="combobox"/aria-expanded avant
 * ce chantier — voir docs/audits/destination-search-autocomplete-audit.md).
 *
 * Remplace les `<Select>` liste fermée et le texte libre non guidé de
 * Hôtels Monde/Packages/Vols par UNE seule implémentation, alimentée par
 * hooks/use-destinations.ts (Canonical Destination Model, chantier 2) —
 * toujours contrôlé par `value`/`onChange` en `external_id` (slug/code
 * IATA déjà utilisé par le module appelant), jamais l'UUID interne.
 *
 * Hôtels Tunisie garde son propre composant (données myGo fraîches, hors
 * périmètre) — pas de fusion avec celui-ci.
 */

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { MapPin, Check } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { FIELD_SHELL, FieldLabel } from "@/components/search-field"
import { useDestinations, type DestinationModule } from "@/hooks/use-destinations"
import { cn } from "@/lib/utils"

export interface DestinationAutocompleteProps {
  module: DestinationModule
  /** external_id sélectionné (slug Hôtels Monde/Packages ou code IATA), "" si aucun. */
  value: string
  onChange: (externalId: string) => void
  label: string
  /** external_id à exclure de la liste (ex. aéroport déjà choisi comme origine côté Vols). */
  excludeExternalId?: string
  className?: string
}

function localizedName(
  locale: string,
  name: string,
  nameEn: string | null,
  nameAr: string | null,
): string {
  if (locale === "en") return nameEn || name
  if (locale === "ar") return nameAr || name
  return name
}

export function DestinationAutocomplete({
  module,
  value,
  onChange,
  label,
  excludeExternalId,
  className,
}: DestinationAutocompleteProps) {
  const t = useTranslations("DestinationAutocomplete")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const { destinations, loading, error } = useDestinations(module)

  const options = useMemo(
    () =>
      destinations
        .filter((d) => d.externalId !== excludeExternalId)
        .map((d) => ({
          externalId: d.externalId,
          displayName: localizedName(locale, d.name, d.nameEn, d.nameAr),
          displayCountry: d.countryName
            ? localizedName(locale, d.countryName, d.countryNameEn, d.countryNameAr)
            : null,
        })),
    [destinations, excludeExternalId, locale],
  )

  const selected = options.find((d) => d.externalId === value)
  const listboxId = `destination-autocomplete-${module}-listbox`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listboxId}
          className={cn(FIELD_SHELL, className)}
        >
          <FieldLabel icon={MapPin}>{label}</FieldLabel>
          {selected ? (
            <span className="truncate text-sm font-semibold">
              {selected.displayName}
              {selected.displayCountry && (
                <span className="text-muted-foreground ms-1 font-normal">
                  ({selected.displayCountry})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground truncate text-sm font-normal">
              {t("searchPlaceholder")}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent id={listboxId} className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>
              {loading ? t("loading") : error ? t("loadError") : t("noResults")}
            </CommandEmpty>
            <CommandGroup>
              {options.map((d) => (
                <CommandItem
                  key={d.externalId}
                  value={`${d.displayName} ${d.displayCountry || ""}`}
                  onSelect={() => {
                    onChange(d.externalId)
                    setOpen(false)
                  }}
                >
                  <MapPin className="text-muted-foreground me-2 size-4" />
                  <span>{d.displayName}</span>
                  {d.displayCountry && (
                    <span className="text-muted-foreground ms-auto text-xs">
                      {d.displayCountry}
                    </span>
                  )}
                  {value === d.externalId && (
                    <Check className="text-primary ms-2 size-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
