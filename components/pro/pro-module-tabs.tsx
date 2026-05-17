"use client"

import { useId } from "react"
import { BedDouble, Car, Activity, PackageOpen } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProModule = "hotels" | "transfer" | "activities" | "packages"

const MODULES: Array<{
  id: ProModule
  label: string
  description: string
  icon: typeof BedDouble
  /** Couleur principale du tab actif (pastille + halo). */
  hue: string
}> = [
  {
    id: "hotels",
    label: "Hôtels",
    description: "Réservez vos chambres à travers la Tunisie",
    icon: BedDouble,
    hue: "bg-accent text-accent-foreground",
  },
  {
    id: "transfer",
    label: "Transfert",
    description: "Aéroport, gare, point-à-point",
    icon: Car,
    hue: "bg-muted text-foreground",
  },
  {
    id: "activities",
    label: "Activités",
    description: "Excursions, loisirs, billetterie",
    icon: Activity,
    hue: "bg-primary/15 text-primary",
  },
  {
    id: "packages",
    label: "Formules",
    description: "Forfaits combinés Easy2Book",
    icon: PackageOpen,
    hue: "bg-secondary/15 text-secondary",
  },
]

interface ProModuleTabsProps {
  value: ProModule
  onChange: (next: ProModule) => void
  className?: string
}

export function ProModuleTabs({ value, onChange, className }: ProModuleTabsProps) {
  const tabsListId = useId()
  return (
    <div
      role="tablist"
      aria-label="Modules de recherche"
      id={tabsListId}
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4",
        className,
      )}
    >
      {MODULES.map((mod) => {
        const isActive = mod.id === value
        const Icon = mod.icon
        return (
          <button
            key={mod.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tabsListId}-${mod.id}`}
            onClick={() => onChange(mod.id)}
            className={cn(
              "group bg-card relative flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "shadow-e2b-soft hover:-translate-y-0.5 hover:shadow-e2b-elevated",
              isActive
                ? "border-primary ring-2 ring-primary/30 -translate-y-0.5"
                : "border-border/60",
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl transition-all",
                mod.hue,
                isActive && "scale-110",
              )}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-foreground text-sm font-semibold uppercase tracking-wide">
                {mod.label}
              </div>
              <div className="text-muted-foreground mt-0.5 hidden text-xs leading-tight md:block">
                {mod.description}
              </div>
            </div>
            {isActive ? (
              <span
                aria-hidden
                className="bg-primary absolute -bottom-1 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { MODULES as PRO_MODULES }
