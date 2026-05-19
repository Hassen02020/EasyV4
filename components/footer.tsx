import {
  ShieldCheck,
  Phone,
  CheckCircle,
  Building2,
  Facebook,
  Instagram,
  Linkedin,
} from "lucide-react"
import { Easy2BookLogo } from "@/components/easy2book-logo"

const trustBadges = [
  {
    icon: ShieldCheck,
    title: "Paiement 100% Sécurisé",
    description: "SPS / Monétique Tunisie",
  },
  {
    icon: Phone,
    title: "Support Local 7j/7",
    description: "+216 98 140 514",
  },
  {
    icon: CheckCircle,
    title: "Disponibilité Réelle",
    description: "MyGo/APIGDS",
  },
  {
    icon: Building2,
    title: "Agence Physique",
    description: "À Tunis",
  },
]

const socialLinks = [
  { icon: Facebook, href: "#", label: "Facebook" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
]

export function Footer() {
  return (
    <footer className="bg-card border-border border-t">
      {/* Trust Badges */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {trustBadges.map((badge, index) => {
            const Icon = badge.icon
            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1e3a5f]/10">
                  <Icon className="size-5 text-[#1e3a5f]" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {badge.title}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {badge.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="border-border border-t bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Brand */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Easy2BookLogo className="size-12 rounded-lg bg-white p-1" />
                <div className="flex flex-col leading-tight">
                  <span className="text-xl font-bold">
                    <span className="text-white">Easy</span>
                    <span className="text-[#e5b94e]">2</span>
                    <span className="text-white">Book</span>
                  </span>
                  <span className="text-[10px] tracking-widest text-white/60 uppercase">
                    Centrale de Réservation
                  </span>
                </div>
              </div>
              <p className="max-w-xs text-sm text-white/70">
                Votre partenaire de confiance pour tous vos voyages en Tunisie
                et dans le monde.
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-3 pt-2">
                {socialLinks.map((social, index) => {
                  const Icon = social.icon
                  return (
                    <a
                      key={index}
                      href={social.href}
                      aria-label={social.label}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-[#e5b94e]"
                    >
                      <Icon className="size-4" />
                    </a>
                  )
                })}
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-[#e5b94e]">Nos Services</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Vols
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Hôtels Tunisie (MyGo)
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Hôtels Monde
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Omraty
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Voyages Organisés
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Transferts
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-white">
                    Location de voiture
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h4 className="font-semibold text-[#e5b94e]">Contact</h4>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-[#e5b94e]" />
                  <a
                    href="tel:+21698140514"
                    className="font-medium transition-colors hover:text-white"
                  >
                    +216 98 140 514
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Building2 className="size-4 text-[#e5b94e]" />
                  <span>Tunis, Tunisie</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="bg-[#152d4a]">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            {/* Links */}
            <div className="flex items-center gap-4 text-xs text-white/60 sm:gap-6 sm:text-sm">
              <a href="#" className="transition-colors hover:text-white">
                Mentions légales
              </a>
              <a href="#" className="transition-colors hover:text-white">
                CGV
              </a>
              <a href="#" className="transition-colors hover:text-white">
                Politique de confidentialité
              </a>
            </div>

            {/* Payment Methods */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5">
                <span className="text-xs font-bold text-[#1A1F71]">VISA</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5">
                <div className="flex">
                  <div className="-mr-1.5 h-4 w-4 rounded-full bg-[#EB001B]"></div>
                  <div className="h-4 w-4 rounded-full bg-[#F79E1B] opacity-80"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="bg-[#0f2237]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-white/50">
            © 2026 Easy2Book. Tous droits réservés. Agence de voyage agréée en
            Tunisie.
          </p>
        </div>
      </div>
    </footer>
  )
}
