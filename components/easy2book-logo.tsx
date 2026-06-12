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
  if (!withWordmark) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl",
          className,
        )}
      >
        <Image
          src="/easy2book-logo.png"
          alt="Logo Easy2Book"
          width={1024}
          height={1024}
          priority={priority}
          className="h-[170%] w-full object-cover object-top"
        />
      </div>
    )
  }

  return (
    <Image
      src="/easy2book-logo.png"
      alt="Easy2Book — Centrale de Réservation"
      width={1024}
      height={1024}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
    />
  )
}
