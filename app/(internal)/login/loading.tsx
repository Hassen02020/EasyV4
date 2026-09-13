import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton de la page /login pendant le chargement.
 */
export default function LoginLoading() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="mt-6 h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="space-y-4 rounded-2xl border p-6 shadow-sm">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mx-auto h-3 w-56" />
      </div>
    </main>
  )
}
