import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton de la page /booking/checkout pendant le chargement du draft.
 */
export default function CheckoutLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-16 border-b" />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="mb-6 h-4 w-96" />
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-80 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
