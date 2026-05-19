import Image from "next/image"
import { cn } from "@/lib/utils"

interface Easy2BookLogoProps {
  className?: string
  /** `true` (par défaut) : logo + texte. `false` : version icône seule. */
  withWordmark?: boolean
  priority?: boolean
}

/**
 * Logo officiel Easy2Book — Centrale de Réservation.
 *
 * - `withWordmark = true` (défaut) : affiche le PNG complet (avion + check
 *   + wordmark "Easy2Book" + baseline). Conserver un ratio carré.
 * - `withWordmark = false` : version compacte cliblée par largeur, utile
 *   dans une barre de navigation à côté d'un mot rendu côté React.
 */
export function Easy2BookLogo({
  className,
  withWordmark = true,
  priority = false,
}: Easy2BookLogoProps) {
  return (
    <Image
      src="/easy2book-logo.png"
      alt={
        withWordmark ? "Easy2Book — Centrale de Réservation" : "Logo Easy2Book"
      }
      width={1024}
      height={1024}
      priority={priority}
      className={cn(
        "shrink-0 object-contain",
        withWordmark ? "h-auto w-auto" : "aspect-square",
        className,
      )}
    />
  )
}
