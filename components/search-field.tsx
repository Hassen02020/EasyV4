/**
 * Style partagé des champs de recherche ("chip" doux, glassmorphism léger)
 * — utilisé par components/booking-engine.tsx (Vols/Hôtels Monde/Omraty/
 * Voyages/Transferts/Car) ET components/hotels-tunisie-search.tsx, pour que
 * les 7 modules du moteur de recherche partagent exactement le même
 * langage visuel. Extrait dans son propre fichier (plutôt que défini dans
 * booking-engine.tsx) pour éviter un import circulaire : booking-engine.tsx
 * importe HotelsTunisieSearch dynamiquement (code-splitting), donc
 * hotels-tunisie-search.tsx ne peut pas importer depuis booking-engine.tsx.
 */

/** Cadre "chip" partagé par tous les champs — fond doux, survol subtil,
 * focus surélevé (glow + fond blanc). */
export const FIELD_SHELL =
  "flex w-full flex-col gap-0.5 rounded-2xl border border-transparent bg-muted/60 px-3.5 py-2.5 text-left transition-all duration-150 hover:bg-muted focus-within:border-primary/30 focus-within:bg-card focus-within:shadow-e2b-soft data-[state=open]:border-primary/30 data-[state=open]:bg-card data-[state=open]:shadow-e2b-soft"

/** Input/Select/Button nu, chrome retiré pour s'insérer proprement dans FIELD_SHELL. */
export const FIELD_INPUT_RESET =
  "h-auto w-full border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0"

export function FieldLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <span className="text-muted-foreground/75 flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase">
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  )
}
