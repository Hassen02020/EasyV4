import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  { num: 1, label: "Offre" },
  { num: 2, label: "Voyageurs" },
  { num: 3, label: "Paiement" },
]

export function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, i) => {
        const done = current > step.num
        const active = current === step.num
        return (
          <li key={step.num} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                done && "border-emerald-600 bg-emerald-600 text-white",
                active && "border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-md",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : step.num}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 ? (
              <div
                className={cn(
                  "mx-2 h-px flex-1 transition-colors",
                  done ? "bg-emerald-500" : "bg-border",
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
