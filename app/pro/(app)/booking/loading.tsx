import { Skeleton } from "@/components/ui/skeleton"

/**
 * État de chargement du tunnel de réservation B2B. Affiché pendant la
 * navigation / la transition serveur (notamment après le clic "Confirmer"
 * en mode compte de dépôt) — empêche un double-clic sur le bouton de
 * validation pendant que la Server Action `bookHotelB2B` s'exécute.
 */
export default function BookingLoading() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-border/60 shadow-e2b-soft space-y-4 rounded-2xl border p-4 md:p-5"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>

      <aside className="space-y-4">
        <div className="bg-card border-border/60 shadow-e2b-soft space-y-3 rounded-2xl border p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </aside>
    </div>
  )
}
