import {
  ShieldCheck,
  Phone,
  CheckCircle,
  Building2,
  Facebook,
  Instagram,
} from "lucide-react"

// Icône WhatsApp personnalisée
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}
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

// Icône TikTok personnalisée (non disponible dans lucide-react)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  )
}

const socialLinks = [
  { icon: Facebook, href: "https://www.facebook.com/Easy2Bookplateforme", label: "Facebook" },
  { icon: Instagram, href: "https://www.instagram.com/easy2book.2025", label: "Instagram" },
  { icon: TikTokIcon, href: "https://tiktok.com/@easy2book", label: "TikTok" },
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
                      target="_blank"
                      rel="noopener noreferrer"
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
                    Hôtels Tunisie
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
                  <WhatsAppIcon className="size-4 text-[#e5b94e]" />
                  <a
                    href="https://wa.me/21698140514"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium transition-colors hover:text-white"
                  >
                    WhatsApp Business
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
