/**
 * Footer global du portail B2B `/pro/*`.
 *
 * Réplique l'identité visuelle "Centrale de Réservation" : 2 blocs urgence /
 * support, mention copyright Easy2Book et lien réseaux sociaux.
 */

import Link from "next/link"
import { Phone, Mail, ShieldAlert, Headphones } from "lucide-react"

export function ProFooter() {
  return (
    <footer className="bg-muted/40 border-border/50 mt-12 border-t py-10">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
          <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <Headphones className="text-primary h-4 w-4" />
            Help Desk 24H / 24 — 7J / 7
          </div>
          <div className="text-muted-foreground flex flex-col gap-1 text-sm md:flex-row md:gap-4">
            <a
              href="tel:+21671130603"
              className="hover:text-primary inline-flex items-center gap-1.5 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              (+216) 71 130 603
            </a>
            <a
              href="mailto:operations@easy2book.tn"
              className="hover:text-primary inline-flex items-center gap-1.5 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              operations@easy2book.tn
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-center md:items-end md:text-right">
          <div className="text-foreground inline-flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <ShieldAlert className="text-accent h-4 w-4" />
            Emergency 24H / 24 — 7J / 7
          </div>
          <div className="text-muted-foreground flex flex-col gap-1 text-sm md:flex-row md:gap-4">
            <a
              href="tel:+21671130606"
              className="hover:text-primary inline-flex items-center gap-1.5 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              (+216) 71 130 606
            </a>
            <a
              href="mailto:emergency@easy2book.tn"
              className="hover:text-primary inline-flex items-center gap-1.5 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              emergency@easy2book.tn
            </a>
          </div>
        </div>
      </div>

      <div className="border-border/30 mt-8 flex flex-col items-center gap-2 border-t px-4 pt-6 text-center text-xs">
        <p className="text-muted-foreground">
          Nous suivre :{" "}
          <Link href="/" className="text-primary font-medium hover:underline">
            easy2book.tn
          </Link>
        </p>
        <p className="text-muted-foreground/80">
          Copyright © {new Date().getFullYear()} Easy2Book. Tous droits
          réservés.
        </p>
      </div>
    </footer>
  )
}
