/**
 * Page de recherche Omra — /omra
 * Server Component : charge les packages disponibles depuis la DB.
 */

import { Suspense } from "react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { OmraSearch } from "@/components/omra/omra-search"
import { OmraPackageList } from "@/components/omra/omra-package-list"
import { getDb } from "@/lib/db/client"
import { omraPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Omraty — Réservez votre Omra | Easy2Book",
  description:
    "Packages Omra tout inclus au départ de Tunisie. Vols, hôtels Médine/La Mecque, visa, transport.",
}

async function getActivePackages() {
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

export default async function OmraPage() {
  const packages = await getActivePackages()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-emerald-300 uppercase">
              Module Omraty
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Réservez votre Omra sereinement
            </h1>
            <p className="mx-auto max-w-2xl text-emerald-100">
              Packages tout inclus — vols, hôtels étoilés à Médine et La Mecque,
              transport, visa et assistance 7j/7.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          <OmraSearch />

          <Suspense
            fallback={
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-64 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            }
          >
            <OmraPackageList packages={packages} />
          </Suspense>
        </div>
      </main>
      <Footer />
    </div>
  )
}
