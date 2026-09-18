import { Skeleton } from "@/components/ui/skeleton"

export default function ReservationsLoading() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Table rows */}
      <div className="border-border/60 rounded-xl border bg-white">
        <div className="border-border/60 border-b p-3">
          <Skeleton className="h-5 w-full" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-border/40 border-b p-3 last:border-0">
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-48" />
      </div>
    </div>
  )
}
