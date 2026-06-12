import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton de la fiche hôtel pendant l'appel API MyGo `HotelDetail`.
 */
export default function HotelDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-6 lg:py-10">
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 h-9 w-2/3 max-w-xl" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-72 w-full rounded-lg" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
          <Skeleton className="h-32 w-full" />
        </div>

        <aside className="bg-card space-y-4 rounded-lg border p-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </aside>
      </div>
    </div>
  )
}
