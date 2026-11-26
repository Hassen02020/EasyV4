import * as React from "react"
import { AlertCircle, Inbox, Loader2, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * UI-LOT1A — état de page unique : vide, erreur, chargement.
 *
 * Les textes (titre, description, action) sont fournis par l'appelant, déjà
 * traduits (next-intl) : ce composant n'invente aucun libellé.
 * - `error` : `role="alert"` (annoncé aux lecteurs d'écran).
 * - `loading` : `role="status"` + `aria-busy`.
 */
type PageStateVariant = "empty" | "error" | "loading"

const DEFAULT_ICON: Record<PageStateVariant, LucideIcon> = {
  empty: Inbox,
  error: AlertCircle,
  loading: Loader2,
}

function PageState({
  variant = "empty",
  title,
  description,
  action,
  icon,
  className,
}: {
  variant?: PageStateVariant
  title: React.ReactNode
  description?: React.ReactNode
  /** Bouton ou lien d'action (ex. « Réessayer », « Modifier la recherche »). */
  action?: React.ReactNode
  icon?: LucideIcon
  className?: string
}) {
  const Icon = icon ?? DEFAULT_ICON[variant]
  return (
    <Empty
      data-variant={variant}
      role={variant === "error" ? "alert" : "status"}
      aria-busy={variant === "loading" ? true : undefined}
      className={cn("border", className)}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(
            variant === "error" && "bg-destructive/10 text-destructive",
            variant !== "error" && "bg-primary-soft text-primary",
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              variant === "loading" &&
                "animate-spin motion-reduce:animate-none",
            )}
          />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

export { PageState, type PageStateVariant }
