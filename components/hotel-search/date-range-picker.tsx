"use client"

/**
 * DateRangePicker canonique — Hotel Search Engine V2 (Tunisie + Monde).
 *
 * Seul composant de sélection de dates de séjour dans tout le moteur de
 * recherche hôtel — remplace le `<input type="date">` natif à deux champs
 * de Hôtels Monde (aucune plage visuelle, aucun nombre de nuits affiché) et
 * la copie quasi-identique déjà présente dans HotelsTunisieSearch, pour
 * qu'aucune des deux surfaces ne puisse diverger dans son calcul de nuitées
 * (voir lib/hotels/date-utils.ts pour le bug UTC corrigé).
 *
 * Comportement (mode="range" de react-day-picker, natif — jamais réimplémenté
 * à la main) : premier clic = arrivée, le picker reste ouvert et le clic
 * suivant pose le départ (doit être strictement après l'arrivée sous peine
 * de redevenir la nouvelle arrivée) — correspond exactement au flux
 * arrivée→départ demandé.
 */

import { useEffect, useId, useState } from "react"
import { useTranslations } from "next-intl"
import { Calendar as CalendarIcon } from "lucide-react"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { getDateFnsLocale } from "@/lib/i18n-date"
import { calculateNights, todayLocal } from "@/lib/hotels/date-utils"
import { format } from "date-fns"
import { FIELD_SHELL, FieldLabel } from "@/components/search-field"

export interface DateRangePickerProps {
  checkIn: Date | null
  checkOut: Date | null
  onChange: (range: { checkIn: Date | null; checkOut: Date | null }) => void
  locale: string
  /** Libellé du champ déclencheur (traduit par l'appelant — pas de clé i18n figée ici, réutilisé par plusieurs namespaces). */
  label: string
  className?: string
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return isDesktop
}

export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  locale,
  label,
  className,
}: DateRangePickerProps) {
  const t = useTranslations("Common")
  const dateFnsLocale = getDateFnsLocale(locale)
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const panelId = useId()

  const nights = calculateNights(checkIn, checkOut)

  const rangeDisplay = checkIn
    ? checkOut
      ? `${format(checkIn, "dd MMM", { locale: dateFnsLocale })} – ${format(checkOut, "dd MMM yyyy", { locale: dateFnsLocale })}${
          nights > 0 ? ` · ${t("nightsCount", { n: nights })}` : ""
        }`
      : `${format(checkIn, "dd MMM yyyy", { locale: dateFnsLocale })} – …`
    : t("selectDates")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(FIELD_SHELL, className)}
        >
          <FieldLabel icon={CalendarIcon}>{label}</FieldLabel>
          <span
            className={cn(
              !checkIn && "text-muted-foreground font-normal",
              "truncate text-sm font-semibold",
            )}
          >
            {rangeDisplay}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent id={panelId} className="w-auto p-0" align="start">
        <div className="border-b p-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex-1">
              <p className="text-muted-foreground text-xs">{t("checkIn")}</p>
              <p className="font-medium">{checkIn ? format(checkIn, "dd/MM/yyyy") : "—"}</p>
            </div>
            <div className="flex-1">
              <p className="text-muted-foreground text-xs">{t("checkOut")}</p>
              <p className="font-medium">{checkOut ? format(checkOut, "dd/MM/yyyy") : "—"}</p>
            </div>
            {nights > 0 && (
              <div className="text-primary text-xs font-semibold whitespace-nowrap">
                {t("nightsCount", { n: nights })}
              </div>
            )}
          </div>
        </div>
        <CalendarComponent
          mode="range"
          selected={
            checkIn && checkOut
              ? { from: checkIn, to: checkOut }
              : checkIn
                ? { from: checkIn, to: undefined }
                : undefined
          }
          onSelect={(range) => {
            const nextCheckIn = range?.from ?? null
            const nextCheckOut = range?.to ?? null
            onChange({ checkIn: nextCheckIn, checkOut: nextCheckOut })
            if (nextCheckIn && nextCheckOut) {
              setOpen(false)
            }
          }}
          numberOfMonths={isDesktop ? 2 : 1}
          disabled={{ before: todayLocal() }}
          locale={dateFnsLocale}
        />
      </PopoverContent>
    </Popover>
  )
}
