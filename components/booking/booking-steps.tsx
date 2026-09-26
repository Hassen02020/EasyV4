import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface BookingStepsProps {
  current: 1 | 2 | 3 | 4
  /** Pass the reservation module to show context-appropriate step labels. */
  module?: string
}

export function BookingSteps({ current, module }: BookingStepsProps) {
  const t = useTranslations("Booking")
  const tc = useTranslations("Common")

  const isFlight = module === "flight"

  const STEPS = isFlight
    ? [
        { num: 1, label: t("stepSearch") },
        { num: 2, label: t("stepPassengers") },
        { num: 3, label: t("stepConfirmation") },
      ]
    : [
        { num: 1, label: t("stepOffer") },
        { num: 2, label: tc("voyageurs") },
        { num: 3, label: t("stepPayment") },
      ]

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
                done && "border-success bg-success text-success-foreground",
                active && "border-sidebar bg-sidebar text-white shadow-md",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : step.num}
            </div>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 ? (
              <div
                className={cn(
                  "mx-2 h-px flex-1 transition-colors",
                  done ? "bg-success" : "bg-border",
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
