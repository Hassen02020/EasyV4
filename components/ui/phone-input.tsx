"use client"

/**
 * PHONE-INTL-VOLS-HOTELS-MONDE-01 — sélecteur pays + indicatif réutilisable,
 * valeur exposée en E.164 (ex. "+33612345678"). Remplace les champs
 * `<Input type="tel">` texte libre sur les formulaires guest vols/hôtels-monde
 * — ces deux flux acceptent déjà n'importe quel pays côté validation/stockage
 * (aucun passage par la normalisation Tunisie-only de CONTACT-01,
 * lib/crm/contact-core.ts), ce composant est une amélioration de clarté de
 * saisie, pas un correctif de données.
 *
 * Noms de pays localisés via `Intl.DisplayNames` (zéro liste à maintenir,
 * zéro traduction manuelle) — indicatifs et formatage via libphonenumber-js
 * (même bibliothèque que react-phone-number-input, sans son CSS par défaut,
 * pour rester dans le design system shadcn du projet).
 */

import { useMemo, useState } from "react"
import { useLocale } from "next-intl"
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js/core"
import { metadata, type CountryCode } from "@/lib/phone/metadata"
import { Check, ChevronsUpDown } from "lucide-react"
import { Input } from "./input"
import { Button } from "./button"
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
import { cn } from "@/lib/utils"

function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

interface CountryOption {
  code: CountryCode
  name: string
  dial: string
}

export interface PhoneInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  defaultCountry?: CountryCode
  className?: string
  placeholder?: string
  "aria-invalid"?: boolean
}

export function PhoneInput({
  id,
  value,
  onChange,
  defaultCountry = "TN",
  className,
  placeholder,
  ...rest
}: PhoneInputProps) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  // Initialisation paresseuse au montage à partir de `value` (E.164) — pas
  // de useEffect de resynchronisation : aucun appelant actuel ne modifie
  // `value` depuis l'extérieur après le montage (pas de form.reset() avec
  // un téléphone non vide sur ces formulaires), et synchroniser un setState
  // dans un effet déclenche des rendus en cascade évitables.
  const [country, setCountry] = useState<CountryCode>(() => {
    if (value) {
      const parsed = parsePhoneNumberFromString(value, metadata)
      if (parsed?.country) return parsed.country
    }
    return defaultCountry
  })
  const [nationalText, setNationalText] = useState<string>(() => {
    if (value) {
      const parsed = parsePhoneNumberFromString(value, metadata)
      if (parsed) return parsed.formatNational()
    }
    return ""
  })

  const countries = useMemo<CountryOption[]>(() => {
    let displayNames: Intl.DisplayNames | null = null
    try {
      displayNames = new Intl.DisplayNames([locale], { type: "region" })
    } catch {
      displayNames = null
    }
    return getCountries(metadata)
      .map((code) => ({
        code,
        name: displayNames?.of(code) ?? code,
        dial: getCountryCallingCode(code, metadata),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [locale])

  const selected =
    countries.find((c) => c.code === country) ?? countries[0] ?? null

  function emitFromNational(country: CountryCode, national: string) {
    const formatter = new AsYouType(country, metadata)
    formatter.input(national)
    const num = formatter.getNumber()
    if (num) {
      onChange(num.number)
    } else if (national.trim() === "") {
      onChange("")
    } else {
      const digits = national.replace(/\D/g, "")
      onChange(
        digits ? `+${getCountryCallingCode(country, metadata)}${digits}` : "",
      )
    }
  }

  function handleNationalChange(raw: string) {
    const formatter = new AsYouType(country, metadata)
    const formatted = formatter.input(raw)
    setNationalText(formatted)
    emitFromNational(country, raw)
  }

  function handleCountrySelect(next: CountryOption) {
    setCountry(next.code)
    setOpen(false)
    emitFromNational(next.code, nationalText)
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[108px] shrink-0 justify-between px-2"
          >
            <span className="flex items-center gap-1 truncate">
              <span>{selected ? flagEmoji(selected.code) : ""}</span>
              <span className="text-muted-foreground text-xs">
                +{selected?.dial ?? ""}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="..." />
            <CommandList>
              <CommandEmpty>—</CommandEmpty>
              <CommandGroup>
                {countries.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} ${c.code} +${c.dial}`}
                    onSelect={() => handleCountrySelect(c)}
                  >
                    <span className="mr-1">{flagEmoji(c.code)}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-muted-foreground text-xs">
                      +{c.dial}
                    </span>
                    <Check
                      className={cn(
                        "ml-1 size-4",
                        c.code === country ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        value={nationalText}
        onChange={(e) => handleNationalChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
        {...rest}
      />
    </div>
  )
}
