import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton de la page /booking/travelers pendant le chargement du draft.
 */
export default function TravelersLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-16 border-b" />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="mb-2 h-8 w-72" />
          <Skeleton className="mb-6 h-4 w-96" />
          <Skeleton className="mb-8 h-12 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  )
}
