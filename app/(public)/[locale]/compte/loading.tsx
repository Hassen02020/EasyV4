import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="from-background via-background to-accent/5 min-h-screen bg-gradient-to-br">
      <div className="border-border border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>

        <Skeleton className="mb-6 h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  )
}
