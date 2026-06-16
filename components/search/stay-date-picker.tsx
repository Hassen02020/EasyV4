"use client"

import { useMemo, useState } from "react"
import { addDays, differenceInCalendarDays, format, isBefore } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarDays, Minus, Moon, Plus } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface StayValue {
  checkIn?: Date
  checkOut?: Date
}

interface StayDatePickerProps {
  value: StayValue
  onChange: (value: StayValue) => void
  /** Nombre minimum de nuits (défaut : 1). */
  minNights?: number
  /** Nombre maximum de nuits sélectionnables via l'onglet « Nuits ». */
  maxNights?: number
  numberOfMonths?: number
  triggerClassName?: string
  placeholder?: string
  align?: "start" | "center" | "end"
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function StayDatePicker({
  value,
  onChange,
  minNights = 1,
  maxNights = 30,
  numberOfMonths = 2,
  triggerClassName,
  placeholder = "Sélectionner les dates",
  align = "start",
}: StayDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"dates" | "nights">("dates")

  const today = useMemo(() => startOfToday(), [])

  const nights = useMemo(() => {
    if (value.checkIn && value.checkOut) {
      return Math.max(0, differenceInCalendarDays(value.checkOut, value.checkIn))
    }
    return 0
  }, [value.checkIn, value.checkOut])

  // Étape active du stepper : 1 = Arrivée, 2 = Départ.
  const activeStep: 1 | 2 = value.checkIn && !value.checkOut ? 2 : 1

  const triggerLabel = useMemo(() => {
    if (value.checkIn && value.checkOut) {
      return `${format(value.checkIn, "dd MMM", { locale: fr })} – ${format(
        value.checkOut,
        "dd MMM yyyy",
        { locale: fr },
      )}`
    }
    if (value.checkIn) {
      return `${format(value.checkIn, "dd MMM yyyy", { locale: fr })} – …`
    }
    return placeholder
  }, [value.checkIn, value.checkOut, placeholder])

  function handleRangeSelect(range: DateRange | undefined) {
    const from = range?.from
    let to = range?.to
    // Empêche une plage de 0 nuit (arrivée = départ).
    if (from && to && differenceInCalendarDays(to, from) < minNights) {
      to = undefined
    }
    onChange({ checkIn: from, checkOut: to })
    if (from && to) setMode("dates")
  }

  function handleSingleSelect(day: Date | undefined) {
    if (!day) {
      onChange({})
      return
    }
    const currentNights =
      value.checkIn && value.checkOut
        ? Math.max(minNights, differenceInCalendarDays(value.checkOut, value.checkIn))
        : minNights
    onChange({ checkIn: day, checkOut: addDays(day, currentNights) })
  }

  function setNights(next: number) {
    const clamped = Math.min(maxNights, Math.max(minNights, next))
    const from = value.checkIn ?? today
    onChange({ checkIn: from, checkOut: addDays(from, clamped) })
  }

  function reset() {
    onChange({})
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-12 w-full justify-start gap-2 rounded-3xl px-4 text-left font-normal",
            triggerClassName,
          )}
        >
          <CalendarDays className="text-muted-foreground size-4 shrink-0" />
          <span
            className={cn("truncate", !value.checkIn && "text-muted-foreground")}
          >
            {triggerLabel}
          </span>
          {nights > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto shrink-0 gap-1 rounded-full font-medium"
            >
              <Moon className="size-3" />
              {nights} nuit{nights > 1 ? "s" : ""}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto max-w-[95vw] p-0" align={align}>
        {/* Header : onglets Dates/Nuits + badge nuits */}
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <div className="bg-muted inline-flex rounded-full p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMode("dates")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
                mode === "dates"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="size-3.5" />
              Dates
            </button>
            <button
              type="button"
              onClick={() => setMode("nights")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
                mode === "nights"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Moon className="size-3.5" />
              Nuits
            </button>
          </div>
          <Badge
            variant={nights > 0 ? "default" : "secondary"}
            className="shrink-0 rounded-full font-semibold"
          >
            {nights} nuit{nights > 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Stepper Arrivée / Départ */}
        <div className="flex items-stretch gap-2 p-3 pb-0">
          <StepPill
            step={1}
            label="Arrivée"
            date={value.checkIn}
            active={activeStep === 1}
          />
          <div className="bg-border my-auto h-px flex-1" />
          <StepPill
            step={2}
            label="Départ"
            date={value.checkOut}
            active={activeStep === 2}
          />
        </div>

        {/* Corps : calendrier ou sélecteur de nuits */}
        {mode === "dates" ? (
          <Calendar
            mode="range"
            selected={
              value.checkIn
                ? { from: value.checkIn, to: value.checkOut }
                : undefined
            }
            onSelect={handleRangeSelect}
            numberOfMonths={numberOfMonths}
            disabled={{ before: today }}
            defaultMonth={value.checkIn ?? today}
            locale={fr}
          />
        ) : (
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Durée du séjour</p>
                <p className="text-muted-foreground text-xs">
                  {value.checkIn
                    ? `À partir du ${format(value.checkIn, "dd MMM yyyy", {
                        locale: fr,
                      })}`
                    : "Choisissez d'abord une date d'arrivée"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={() => setNights(nights - 1)}
                  disabled={nights <= minNights}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="w-10 text-center font-semibold">
                  {nights || minNights}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={() => setNights((nights || minNights) + 1)}
                  disabled={nights >= maxNights}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
            <Calendar
              mode="single"
              selected={value.checkIn}
              onSelect={handleSingleSelect}
              numberOfMonths={numberOfMonths}
              disabled={{ before: today }}
              defaultMonth={value.checkIn ?? today}
              locale={fr}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={reset}
            disabled={!value.checkIn && !value.checkOut}
          >
            Réinitialiser
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => setOpen(false)}
            disabled={!value.checkIn || !value.checkOut}
          >
            Appliquer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StepPill({
  step,
  label,
  date,
  active,
}: {
  step: 1 | 2
  label: string
  date?: Date
  active: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-2 rounded-xl border px-3 py-2",
        active ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {step}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[11px] leading-tight font-medium",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <p className="truncate text-sm leading-tight font-medium">
          {date ? format(date, "dd MMM yyyy", { locale: fr }) : "—"}
        </p>
      </div>
    </div>
  )
}

/** Utilitaire partagé : nombre de nuits entre deux dates ISO (YYYY-MM-DD). */
export function nightsBetween(checkIn?: string, checkOut?: string): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn)
  const b = new Date(checkOut)
  if (isBefore(b, a)) return 0
  return differenceInCalendarDays(b, a)
}
