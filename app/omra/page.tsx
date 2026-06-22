/**
 * Page Omra — /omra
 *
 * Server Component : hero de recherche + offres Omra (inspiré de la page
 * Omra de référence tunisiebooking.com).
 */

import { Suspense } from "react"
import {
  Plane,
  BedDouble,
  Stamp,
  Users,
  ShieldCheck,
  Phone,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { OmraSearch } from "@/components/omra/omra-search"
import { OmraPackageList } from "@/components/omra/omra-package-list"
import { getDb } from "@/lib/db/client"
import { omraPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { OmraPackage } from "@/lib/db/schema/omra"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Omra 2026 — Tarifs et offres tout compris au départ de Tunisie | Easy2Book",
  description:
    "Réservez votre Omra depuis la Tunisie au meilleur prix en dinar tunisien. Vols, hôtels à Médine et La Mecque, visa, transferts et accompagnement professionnel.",
}

async function getActivePackages(): Promise<OmraPackage[]> {
  try {
    const db = getDb()
    return await db
      .select()
      .from(omraPackages)
      .where(eq(omraPackages.status, "active"))
      .orderBy(omraPackages.validFrom)
  } catch {
    return []
  }
}

function monthOf(date: string | null): string | null {
  if (!date) return null
  return String(new Date(date).getMonth() + 1)
}

const TRUST_ITEMS = [
  { icon: Plane, label: "Vols inclus" },
  { icon: BedDouble, label: "Hôtels Médine & La Mecque" },
  { icon: Stamp, label: "Visa pris en charge" },
  { icon: Users, label: "Accompagnement pro" },
]

export default async function OmraPage({
  searchParams,
}: {
  searchParams: Promise<{
    formule?: string
    type?: string
    month?: string
    pilgrims?: string
  }>
}) {
  const sp = await searchParams
  const all = await getActivePackages()

  const filtered = all.filter((p) => {
    if (sp.formule && p.formule !== sp.formule) return false
    if (sp.type && p.type !== sp.type) return false
    if (sp.month && monthOf(p.validFrom) !== sp.month) return false
    return true
  })

  const featured = filtered.filter((p) => p.featured)
  const rest = filtered.filter((p) => !p.featured)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-700 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:28px_28px]"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-14 md:py-20">
            <p className="mb-3 text-sm font-semibold tracking-widest text-emerald-300 uppercase">
              Voyage spirituel · 2026
            </p>
            <h1 className="max-w-3xl text-3xl leading-tight font-bold md:text-5xl">
              Omra : nos offres imbattables au départ de Tunisie
            </h1>
            <p className="mt-4 max-w-2xl text-emerald-100 md:text-lg">
              Partez en toute sérénité avec un accompagnement complet de A à Z —
              en dinar tunisien et avec facilités de paiement.
            </p>

            <div className="mt-8">
              <OmraSearch
                defaultFormule={sp.formule}
                defaultMonth={sp.month}
                defaultPilgrims={sp.pilgrims}
              />
            </div>

            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRUST_ITEMS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm backdrop-blur-sm"
                >
                  <item.icon className="h-4 w-4 text-emerald-300" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Offres */}
        <div className="mx-auto max-w-6xl px-4 py-10">
          <Suspense
            fallback={
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 animate-pulse rounded-2xl bg-muted"
                  />
                ))}
              </div>
            }
          >
            {featured.length > 0 ? (
              <section className="mb-10">
                <h2 className="mb-1 text-2xl font-bold">
                  Nos offres spéciales Omra
                </h2>
                <p className="mb-5 text-sm text-muted-foreground">
                  Formules tout compris sélectionnées par nos conseillers
                </p>
                <OmraPackageList packages={featured} />
              </section>
            ) : null}

            <section>
              <h2 className="mb-1 text-2xl font-bold">
                {featured.length > 0
                  ? "Tous nos programmes"
                  : "Nos programmes Omra"}
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                {filtered.length} programme{filtered.length > 1 ? "s" : ""}{" "}
                disponible{filtered.length > 1 ? "s" : ""}
              </p>
              <OmraPackageList packages={featured.length > 0 ? rest : filtered} />
            </section>
          </Suspense>

          {/* Aide / contact */}
          <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border bg-card p-6 sm:flex-row">
            <div>
              <p className="font-semibold">Un conseiller à votre écoute 7j/7</p>
              <p className="text-sm text-muted-foreground">
                Nous vous accompagnons dans le choix de votre programme Omra.
              </p>
            </div>
            <a
              href="tel:+21698140514"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 font-medium text-white transition-colors hover:bg-emerald-800"
            >
              <Phone className="h-4 w-4" />
              +216 98 140 514
            </a>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Paiement sécurisé · Agence de voyage agréée
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
