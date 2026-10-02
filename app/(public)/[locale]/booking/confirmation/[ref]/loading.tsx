import { Skeleton } from "@/components/ui/skeleton"

export default function ConfirmationLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-16 border-b" />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <Skeleton className="mb-6 h-8 w-full rounded-xl" />
          <div className="mb-4 flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="mb-4 h-56 w-full rounded-2xl" />
          <Skeleton className="mb-4 h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </main>
    </div>
  )
}
