/**
 * Page Transferts — /transferts
 * Server Component : charge les zones de transfert disponibles.
 */

import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { TransferSearch } from "@/components/transfer/transfer-search"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogTransferZones } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Transferts Aéroport | Easy2Book",
  description:
    "Transferts privés et partagés depuis/vers les aéroports tunisiens. Réservation immédiate, chauffeur professionnel.",
  alternates: { languages: buildLanguageAlternates("/transferts") },
}

async function getZones() {
  try {
    // Catalogue public (trafic anonyme, pas de session storefront) — scopé à
    // l'agence OTA directe, même modèle que Packages/Attractions/Car
    // (getDefaultAgencyId). Avant ce correctif, cette requête n'était PAS
    // scopée par agence : les zones de n'importe quelle agence (y compris
    // une agence B2B sans rapport avec la vitrine publique) apparaissaient
    // dans le sélecteur, menant ensuite à "aucun tarif configuré" puisque
    // calculateTransferPrice(), lui, est correctement scopé.
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext((db) =>
      db
        .select()
        .from(catalogTransferZones)
        .where(and(eq(catalogTransferZones.agencyId, agencyId), eq(catalogTransferZones.status, "active")))
        .orderBy(catalogTransferZones.name),
    )
  } catch {
    return []
  }
}

export default async function TransfertsPage() {
  const zones = await getZones()
  const t = await getTranslations("Transferts")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-slate-300 uppercase">
              {t("kicker")}
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto max-w-2xl text-slate-100">
              {t("heroSubtitle")}
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
