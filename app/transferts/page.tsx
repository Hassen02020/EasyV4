/**
 * Page Transferts — /transferts
 * Server Component : charge les zones de transfert disponibles.
 */

import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { TransferSearch } from "@/components/transfer/transfer-search"
import { getDb } from "@/lib/db/client"
import { catalogTransferZones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Transferts Aéroport | Easy2Book",
  description:
    "Transferts privés et partagés depuis/vers les aéroports tunisiens. Réservation immédiate, chauffeur professionnel.",
}

async function getZones() {
  try {
    const db = getDb()
    return await db
      .select()
      .from(catalogTransferZones)
      .where(eq(catalogTransferZones.status, "active"))
      .orderBy(catalogTransferZones.name)
  } catch {
    return []
  }
}

export default async function TransfertsPage() {
  const zones = await getZones()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-blue-900 to-blue-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-blue-300 uppercase">
              Module Transferts
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Transferts aéroport & inter-villes
            </h1>
            <p className="mx-auto max-w-2xl text-blue-100">
              Véhicules climatisés, chauffeurs professionnels. Berline, Van,
              Minibus ou Bus selon votre groupe.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-10">
          <TransferSearch zones={zones} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
