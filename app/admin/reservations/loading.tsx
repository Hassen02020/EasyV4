import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

/**
 * Skeleton de la page /admin/reservations pendant le chargement Drizzle.
 * Affiche une approximation de la table + filtres + pagination.
 */
export default function ReservationsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-10 w-48" />
      </div>

      <Card className="overflow-hidden rounded-2xl border">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 gap-4 border-b px-4 py-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-7 items-center gap-4 px-4 py-3"
              >
                <Skeleton className="h-3 w-20" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-16 justify-self-end" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-8 w-32 justify-self-end rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
    </div>
  )
}
