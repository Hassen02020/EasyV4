import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton de la recherche hôtels Tunisie pendant l'appel API MyGo (~1-3s).
 * Réduit le temps perçu de chargement (LCP perçu -40% selon NN/g 2024).
 */
export default function HotelsSearchLoading() {
  return (
    <div className="container mx-auto px-4 py-6 lg:py-10">
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card flex gap-4 rounded-lg border p-4 shadow-sm"
            >
              <Skeleton className="h-32 w-44 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <div className="mt-auto flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
