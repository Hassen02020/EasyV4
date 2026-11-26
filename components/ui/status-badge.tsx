import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * UI-LOT1A — badge de statut unique (réservation, paiement, compte…).
 *
 * Remplace à terme les `bg-emerald-100 text-emerald-800`, `bg-amber-100`… en
 * dur dispersés dans admin/pro. Le sens n'est jamais porté par la seule
 * couleur : une icône + le libellé (fourni par l'appelant, traduit) l'expriment.
 * Affichage seulement : aucune logique métier, aucun statut inventé.
 */
const statusBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        danger: "border-destructive/30 bg-destructive/10 text-destructive",
        info: "border-info/30 bg-info/10 text-info",
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

export type StatusTone = NonNullable<
  VariantProps<typeof statusBadgeVariants>["tone"]
>

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
}

function StatusBadge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    /** Icône personnalisée ; `null` pour n'en afficher aucune. */
    icon?: LucideIcon | null
  }) {
  const Icon = icon === null ? null : (icon ?? TONE_ICON[tone ?? "neutral"])
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

export { StatusBadge, statusBadgeVariants }
