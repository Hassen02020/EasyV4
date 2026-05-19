import Link from "next/link"
import {
  TrendingUp,
  Sparkles,
  Calendar,
  FileText,
  Wallet,
  ArrowRight,
} from "lucide-react"

import { ProHomeEngine } from "@/components/pro/pro-home-engine"

export const metadata = {
  title: "Espace Pro — Recherche | Easy2Book",
  description: "Espace de réservation B2B pour agences partenaires Easy2Book",
}

const QUICK_LINKS = [
  {
    href: "/pro/reservations",
    icon: Calendar,
    title: "Mes réservations",
    description: "Suivez et gérez vos dossiers",
  },
  {
    href: "/pro/factures",
    icon: FileText,
    title: "Mes factures",
    description: "Factures, avoirs & proformas",
  },
  {
    href: "/pro/paiements",
    icon: Wallet,
    title: "Mes paiements",
    description: "Liste des règlements & échéances",
  },
] as const

export default function ProHomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="e2b-fade-in-up mb-6 md:mb-8">
        <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
          Centrale de réservation Easy2Book
        </p>
        <h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          Bienvenue sur votre Espace Pro
        </h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">
          Recherchez et réservez parmi 400+ hôtels, transferts, activités et
          formules combinées à travers la Tunisie.
        </p>
      </header>

      <section
        aria-label="Moteur de recherche multi-module"
        className="e2b-fade-in-up"
      >
        <ProHomeEngine />
      </section>

      <section
        aria-label="Accès rapides"
        className="e2b-fade-in-up mt-10 md:mt-12"
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-accent h-4 w-4" />
          <h2 className="text-foreground text-sm font-semibold tracking-wide uppercase">
            Accès rapides
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group bg-card shadow-e2b-soft border-border/60 hover:border-primary/40 hover:shadow-e2b-elevated flex items-center gap-3 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground text-sm font-semibold">
                    {link.title}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {link.description}
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          })}
        </div>
      </section>

      <section
        aria-label="Aperçu de votre activité"
        className="e2b-fade-in-up mt-10 md:mt-12"
      >
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="text-primary h-4 w-4" />
          <h2 className="text-foreground text-sm font-semibold tracking-wide uppercase">
            Aperçu de votre activité
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4 md:gap-4">
          <ActivityCard
            label="Réservations en cours"
            value="—"
            hint="Période 30 j"
          />
          <ActivityCard label="Montant des ventes" value="—" hint="TND TTC" />
          <ActivityCard
            label="Factures en attente"
            value="—"
            hint="Non réglées"
          />
          <ActivityCard label="Marge brute (mois)" value="—" hint="TND" />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Les indicateurs seront alimentés depuis vos données réelles dès vos
          premières réservations.
        </p>
      </section>
    </div>
  )
}

function ActivityCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="bg-card shadow-e2b-soft border-border/60 rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground mt-2 text-2xl font-bold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </div>
  )
}
