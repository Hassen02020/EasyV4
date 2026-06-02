"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ShieldCheck,
  Building2,
  Users,
  HeartHandshake,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import { Easy2BookLogo } from "@/components/easy2book-logo"

type Portal = {
  id: "admin" | "b2b" | "client" | "mutuelle"
  label: string
  description: string
  icon: React.ElementType
  href: string
  color: string
  badge?: string
}

const PORTALS: Portal[] = [
  {
    id: "admin",
    label: "Administration",
    description: "Back-office OTA — Super Admin, Managers & Agents",
    icon: ShieldCheck,
    href: "/login?next=/admin",
    color: "border-[#1e3a5f] bg-[#1e3a5f]/5 hover:bg-[#1e3a5f]/10",
    badge: "Staff",
  },
  {
    id: "b2b",
    label: "Espace Partenaire B2B",
    description: "Portail agences — réservations, wallet & marges",
    icon: Building2,
    href: "/pro/login",
    color: "border-[#e5b94e] bg-[#e5b94e]/5 hover:bg-[#e5b94e]/10",
    badge: "Agences",
  },
  {
    id: "client",
    label: "Mes Réservations",
    description: "Suivre, modifier ou annuler une réservation",
    icon: Users,
    href: "/bookings",
    color: "border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50",
  },
  {
    id: "mutuelle",
    label: "Espace Mutuelle",
    description: "Accès partenaires mutuelle & assurance voyage",
    icon: HeartHandshake,
    href: "/login?next=/mutuelle",
    color: "border-violet-400 bg-violet-50/50 hover:bg-violet-50",
    badge: "Bientôt",
  },
]

export default function LoginSelectPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Portal["id"] | null>(null)

  function handleSelect(portal: Portal) {
    setSelected(portal.id)
    setTimeout(() => router.push(portal.href), 180)
  }

  return (
    <main className="from-background via-background to-accent/10 relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12">
      {/* Background blobs */}
      <div
        aria-hidden
        className="bg-primary/10 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-secondary/15 absolute -right-20 -bottom-20 h-72 w-72 rounded-full blur-3xl"
      />

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Retour à l'accueil">
            <Easy2BookLogo className="h-16 w-16" priority />
          </Link>
          <h1 className="text-foreground mt-5 text-2xl font-semibold tracking-tight">
            Choisissez votre espace
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sélectionnez le portail correspondant à votre profil
          </p>
        </div>

        {/* Portal cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PORTALS.map((portal) => {
            const Icon = portal.icon
            const isSelected = selected === portal.id
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => handleSelect(portal)}
                disabled={isSelected}
                className={`group relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-200 ${portal.color} ${
                  isSelected ? "scale-[0.98] opacity-70" : "hover:scale-[1.01] hover:shadow-md"
                }`}
              >
                {/* Badge */}
                {portal.badge && (
                  <span className="absolute top-3 right-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-600 shadow-sm">
                    {portal.badge}
                  </span>
                )}

                <div className="bg-white/70 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm">
                  <Icon className="h-5 w-5 text-[#1e3a5f]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-foreground font-semibold">{portal.label}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {portal.description}
                  </p>
                </div>

                <ChevronRight className="text-muted-foreground/50 mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            )
          })}
        </div>

        {/* Back link */}
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </main>
  )
}
