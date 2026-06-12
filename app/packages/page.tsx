/**
 * Page Voyages Organisés — /packages
 * Server Component : charge les packages depuis la table catalog_packages.
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { PackageSearch } from "@/components/packages/package-search"
import { PackageList } from "@/components/packages/package-list"
import { getDb } from "@/lib/db/client"
import { catalogPackages } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Voyages Organisés | Easy2Book",
  description:
    "Circuits et voyages organisés au départ de Tunisie. Istanbul, Dubaï, Paris, Rome et plus. Tout inclus.",
}

async function getActivePackages() {
  try {
    const db = getDb()
    return await db
      .select()
      .from(catalogPackages)
      .where(eq(catalogPackages.status, "active"))
      .orderBy(catalogPackages.title)
  } catch {
    return []
  }
}

export default async function PackagesPage() {
  const packages = await getActivePackages()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-violet-900 to-violet-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-violet-300 uppercase">
              Voyages Organisés
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Découvrez le monde avec Easy2Book
            </h1>
            <p className="mx-auto max-w-2xl text-violet-100">
              Circuits clés en main, vols + hôtels + guide inclus. Partez l'esprit
              libre depuis la Tunisie.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          <PackageSearch />
          <PackageList packages={packages} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
