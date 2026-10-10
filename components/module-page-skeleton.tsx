import { Skeleton } from "@/components/ui/skeleton"

/**
 * Shared loading skeleton for all public module pages.
 * Used by loading.tsx in hotels, hotels-monde, vols, transferts, car, omra, attractions, packages.
 */
export function ModulePageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header placeholder */}
      <div className="bg-background h-16 border-b" />

      {/* Hero skeleton */}
      <div className="bg-muted/60 relative h-48 w-full animate-pulse px-4 py-12">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
          <Skeleton className="size-14 rounded-2xl" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      {/* Search form skeleton */}
      <main className="bg-muted/30 flex-1 py-10">
        <div className="mx-auto max-w-4xl px-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  )
}
