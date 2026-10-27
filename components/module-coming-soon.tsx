import type { LucideIcon } from "lucide-react"
import { ArrowLeft } from "lucide-react"
import { Link } from "@/i18n/navigation"

/**
 * Corps de page pour un module public sans fonctionnalité de réservation
 * pour l'instant (ex. Visa, Bateaux & Croisières) — même gabarit visuel que
 * l'état vide de /destinations, couleur d'accent de la marque.
 */
export function ModuleComingSoon({
  icon: Icon,
  title,
  description,
  backHomeLabel,
}: {
  icon: LucideIcon
  title: string
  description: string
  backHomeLabel: string
}) {
  return (
    <main className="bg-muted/30 flex-1">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="bg-card rounded-xl border border-dashed p-12 text-center">
          <div className="bg-accent/15 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Icon
              className="text-accent h-8 w-8"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <h1 className="mb-2 text-lg font-semibold">{title}</h1>
          <p className="text-muted-foreground mb-6 text-sm">{description}</p>
          <Link
            href="/"
            className="text-sidebar focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-[3px]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backHomeLabel}
          </Link>
        </div>
      </div>
    </main>
  )
}
