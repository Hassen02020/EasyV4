import Image from "next/image"
import { cn } from "@/lib/utils"

interface Easy2BookLogoProps {
  className?: string
  width?: number
  height?: number
}

export function Easy2BookLogo({ className, width = 200, height = 60 }: Easy2BookLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Easy2Book - Centrale de Réservation"
      width={width}
      height={height}
      className={cn("shrink-0", className)}
      priority
    />
  )
}
