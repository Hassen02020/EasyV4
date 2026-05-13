import { cn } from "@/lib/utils"

interface TunisiaGoLogoProps {
  className?: string
}

export function TunisiaGoLogo({ className }: TunisiaGoLogoProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="TunisiaGo logo"
      className={cn("shrink-0", className)}
    >
      <circle cx="20" cy="20" r="20" fill="#1e3a5f" />
      <path d="M11 14h18v3H22v13h-4V17h-7z" fill="#ffffff" />
      <path
        d="M8 28c4-3 9-4 14-3 5 1 9 3 12 1"
        stroke="#e5b94e"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
