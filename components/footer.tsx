import { ShieldCheck, Phone, CheckCircle, Building2, Facebook, Instagram, Linkedin } from "lucide-react"
import Image from "next/image"

const trustBadges = [
  {
    icon: ShieldCheck,
    title: "Paiement 100% Sécurisé",
    description: "SPS / Monétique Tunisie",
  },
  {
    icon: Phone,
    title: "Support Client 7j/7",
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
    description: "Tunis, Tunisie",
  },
]

const socialLinks = [
  { icon: Facebook, href: "#", label: "Facebook" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
]

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      {/* Trust Badges */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {trustBadges.map((badge, index) => {
            const Icon = badge.icon
            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                  <Icon className="size-5 text-[#1e3a5f]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {badge.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {badge.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="border-t border-border bg-[#1e3a5f] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Brand */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Image
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/IMG-20251114-WA0025-EuDkN9RXSmMocH0MBMWmAL5fpPoOrR.jpg"
                  alt="Easy2Book"
                  width={40}
                  height={40}
                  className="object-contain bg-white rounded-lg p-1"
                />
                <span className="text-xl font-bold">
                  <span className="text-white">Easy</span>
                  <span className="text-[#e5b94e]">2</span>
                  <span className="text-white">Book</span>
                </span>
              </div>
              <p className="text-sm text-white/70 max-w-xs">
                Votre partenaire de confiance pour tous vos voyages en Tunisie et dans le monde.
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
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#e5b94e] flex items-center justify-center transition-colors"
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
                <li><a href="#" className="hover:text-white transition-colors">Vols</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Hôtels Tunisie (MyGo)</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Hôtels Monde</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Omraty</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Transferts</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h4 className="font-semibold text-[#e5b94e]">Contact</h4>
              <ul className="space-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-[#e5b94e]" />
                  <a href="tel:+21698140514" className="hover:text-white transition-colors font-medium">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Links */}
            <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-white/60">
              <a href="#" className="hover:text-white transition-colors">
                Mentions légales
              </a>
              <a href="#" className="hover:text-white transition-colors">
                CGV
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Politique de confidentialité
              </a>
            </div>

            {/* Payment Methods */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md">
                <span className="text-xs font-bold text-[#1A1F71]">VISA</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-md">
                <div className="flex">
                  <div className="w-4 h-4 rounded-full bg-[#EB001B] -mr-1.5"></div>
                  <div className="w-4 h-4 rounded-full bg-[#F79E1B] opacity-80"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="bg-[#0f2237]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <p className="text-center text-xs text-white/50">
            © 2026 Easy2Book. Tous droits réservés. Agence de voyage agréée en Tunisie.
          </p>
        </div>
      </div>
    </footer>
  )
}
