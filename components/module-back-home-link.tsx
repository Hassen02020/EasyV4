import { ArrowLeft } from "lucide-react"
import { Link } from "@/i18n/navigation"

/**
 * Lien "retour à l'accueil" centré, sous une bannière ModuleHero — utilisé
 * par les modules publics sans fonctionnalité de réservation pour l'instant
 * (Visa, Bateaux & Croisières).
 */
export function ModuleBackHomeLink({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-center">
      <Link
        href="/"
        className="text-sidebar focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md text-sm font-medium outline-none hover:underline focus-visible:ring-[3px]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {label}
      </Link>
    </div>
  )
}
