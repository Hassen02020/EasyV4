import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProPageShellProps {
  icon: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  /** Couleur de la pastille d'icône. Défaut : primary/10. */
  iconTone?: "primary" | "secondary" | "accent"
  className?: string
}

const TONE_CLASSES: Record<
  NonNullable<ProPageShellProps["iconTone"]>,
  string
> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  accent: "bg-accent/15 text-accent",
}

/**
 * Coquille commune pour toutes les pages internes du portail Pro :
 *  - en-tête : pastille d'icône + titre + sous-titre + actions à droite
 *  - corps : children (data table, formulaire, etc.)
 *
 * Permet de garder une UX homogène sans dupliquer les wrappers
 * dans chaque page admin.
 */
export function ProPageShell({
  icon: Icon,
  title,
  description,
  actions,
  children,
  iconTone = "primary",
  className,
}: ProPageShellProps) {
  return (
    <div
      className={cn("mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10", className)}
    >
      <header className="e2b-fade-in-up mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
              TONE_CLASSES[iconTone],
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="text-muted-foreground mt-1 text-sm md:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>
      <section className="e2b-fade-in-up">{children}</section>
    </div>
  )
}

/**
 * Bloc neutre affiché en attendant l'implémentation d'une page.
 * Évite les "404" intermédiaires lors de la navigation B2B.
 */
export function ProPagePlaceholder({
  title,
  hint,
}: {
  title: string
  hint?: string
}) {
  return (
    <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-10 text-center">
      <p className="text-muted-foreground text-sm tracking-wider uppercase">
        En cours de finalisation
      </p>
      <h2 className="text-foreground mt-2 text-xl font-semibold">{title}</h2>
      {hint ? (
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
