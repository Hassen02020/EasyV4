import { Star } from "lucide-react"

export function StarRow({ rating, size = "size-4" }: { rating: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= Math.round(rating) ? `${size} fill-amber-400 text-amber-400` : `${size} text-muted-foreground/40`}
        />
      ))}
    </div>
  )
}
