"use client"

import { useState } from "react"
import {
  Building2,
  Plane,
  Car,
  Moon,
  Sun,
  Percent,
  Coins,
  Save,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { formatTND } from "@/lib/pro/format"

export type MarginModule =
  | "hotel"
  | "flight"
  | "omra"
  | "package"
  | "activity"
  | "transfer"

export type MarginRow = {
  module: MarginModule
  marginType: "percent" | "fixed"
  marginValue: number
  isActive: boolean
}

const MODULE_META: Record<
  MarginModule,
  { label: string; icon: typeof Building2; description: string }
> = {
  hotel: {
    label: "Hôtels Tunisie",
    icon: Building2,
    description: "Séjours hôteliers TN",
  },
  flight: {
    label: "Vols",
    icon: Plane,
    description: "Billetterie aérienne",
  },
  omra: { label: "Omra", icon: Moon, description: "Pèlerinage Omra" },
  package: {
    label: "Voyages organisés",
    icon: Sun,
    description: "Packages tout inclus",
  },
  activity: {
    label: "Activités",
    icon: Sun,
    description: "Excursions & expériences",
  },
  transfer: {
    label: "Transferts",
    icon: Car,
    description: "Transferts aéroport",
  },
}

interface MarginsFormProps {
  initial: MarginRow[]
}

export function MarginsForm({ initial }: MarginsFormProps) {
  const [rows, setRows] = useState<MarginRow[]>(initial)
  const [submitting, setSubmitting] = useState(false)

  function updateRow(module: MarginModule, patch: Partial<MarginRow>) {
    setRows((prev) =>
      prev.map((r) => (r.module === module ? { ...r, ...patch } : r)),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    // Mock — sera Server Action sur pricing_margins en phase 9
    setTimeout(() => {
      setSubmitting(false)
      toast.success("Marges enregistrées (mock — phase 9 : Server Action)")
    }, 600)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const Mod = MODULE_META[row.module]
          const Icon = Mod.icon
          return (
            <article
              key={row.module}
              className={cn(
                "bg-card border-border/60 shadow-e2b-soft rounded-2xl border p-4 transition-all",
                !row.isActive && "opacity-60",
              )}
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {Mod.label}
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      {Mod.description}
                    </p>
                  </div>
                </div>
                <label className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={row.isActive}
                    onCheckedChange={(c) =>
                      updateRow(row.module, { isActive: c === true })
                    }
                  />
                  Actif
                </label>
              </header>

              <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => updateRow(row.module, { marginType: "percent" })}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                      row.marginType === "percent"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Percent className="h-3 w-3" /> %
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRow(row.module, { marginType: "fixed" })}
                    className={cn(
                      "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                      row.marginType === "fixed"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Coins className="h-3 w-3" /> DT
                  </button>
                </div>

                <div>
                  <Label className="sr-only" htmlFor={`val-${row.module}`}>
                    Valeur
                  </Label>
                  <div className="relative">
                    <Input
                      id={`val-${row.module}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={row.marginValue}
                      onChange={(e) =>
                        updateRow(row.module, {
                          marginValue: Number.parseFloat(e.target.value) || 0,
                        })
                      }
                      className="pr-12 text-right tabular-nums"
                      disabled={!row.isActive}
                    />
                    <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {row.marginType === "percent" ? "%" : "DT"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-muted-foreground mt-2 text-xs">
                Simulation : 1 000,000 DT net →{" "}
                <span className="text-primary font-semibold">
                  {row.marginType === "percent"
                    ? formatTND(1000 * (1 + row.marginValue / 100))
                    : formatTND(1000 + row.marginValue)}
                </span>{" "}
                client
              </div>
            </article>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting} className="rounded-xl">
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Enregistrer les marges
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
