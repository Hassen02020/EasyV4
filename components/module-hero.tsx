import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModuleHeroProps {
  Icon: LucideIcon
  /** Tailwind gradient utility string: "from-blue-900 to-blue-700" */
  gradient: string
  kicker: string
  title: string
  subtitle?: string
  /** Optional slot — inline search form rendered inside the hero (Attractions) */
  children?: React.ReactNode
}

export function ModuleHero({
  Icon,
  gradient,
  kicker,
  title,
  subtitle,
  children,
}: ModuleHeroProps) {
  return (
    <div className={cn("bg-gradient-to-br px-4 py-12 text-white", gradient)}>
      <div className="mx-auto max-w-4xl text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
          <Icon className="size-7" />
        </div>
        <p className="mb-2 text-sm font-medium tracking-widest text-white/60 uppercase">
          {kicker}
        </p>
        <h1 className="mb-4 text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle ? (
          <p className={cn("mx-auto max-w-2xl text-white/80", children && "mb-6")}>
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  )
}
