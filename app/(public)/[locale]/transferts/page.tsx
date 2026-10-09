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
import { getPublicModuleVisual } from "@/lib/public/site-content"
import { getActiveTransferZones } from "@/lib/transfers/catalog"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Transferts Aéroport | Easy2Book",
  description:
    "Transferts privés et partagés depuis/vers les aéroports tunisiens. Réservation immédiate, chauffeur professionnel.",
  alternates: { languages: buildLanguageAlternates("/transferts") },
}

interface TransfertsSearchParams {
  from?: string
  to?: string
}

export default async function TransfertsPage({
  searchParams,
}: {
  searchParams: Promise<TransfertsSearchParams>
}) {
  const { from, to } = await searchParams
  const zones = await getActiveTransferZones()
  const t = await getTranslations("Transferts")
  const visual = await getPublicModuleVisual("transferts")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Navigation}
          gradient="from-slate-900 to-slate-700"
          imageUrl={visual?.heroImageUrl ?? "https://images.unsplash.com/photo-1449965408869-eaa3f722e718?w=1800&q=85&auto=format&fit=crop"}
          kicker={t("kicker")}
          title={t("heroTitle")}
          subtitle={t("heroSubtitle")}
        />

        <div className="mx-auto max-w-4xl px-4 py-10">
          <TransferSearch
            zones={zones}
            initialFromZone={from}
            initialToZone={to}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
