/**
 * Page Transferts — /transferts
 * Server Component : charge les zones de transfert disponibles.
 */

import { Navigation } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { TransferSearch } from "@/components/transfer/transfer-search"
import { ModuleHero } from "@/components/module-hero"
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
        <ModuleHero
          Icon={Navigation}
          gradient="from-slate-900 to-slate-700"
          imageUrl="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1800&q=85&auto=format&fit=crop"
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />

        <div className="mx-auto max-w-4xl px-4 py-10">
          <TransferSearch zones={zones} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
