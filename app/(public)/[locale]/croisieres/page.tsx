/**
 * Module Bateaux & Croisières — /croisieres
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend croisières dans le projet à ce jour).
 * VISA-CROISIERES-HERO-CONCEPT-01 : même gabarit ModuleHero que les modules
 * réels (Attractions, Omra, Vols, ...), sans formulaire de recherche (pas de
 * fonctionnalité fictive) ni image de bannière inventée (dégradé seul).
 */

import { getTranslations } from "next-intl/server"
import { Ship } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { ModuleBackHomeLink } from "@/components/module-back-home-link"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export async function generateMetadata() {
  const t = await getTranslations("ModulePlaceholder")
  return {
    title: `${t("croisieresTitle")} | Easy2Book`,
    description: t("croisieresDescription"),
    alternates: { languages: buildLanguageAlternates("/croisieres") },
  }
}

export default async function CroisieresPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("ModulePlaceholder"),
    getTranslations("Common"),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Ship}
          gradient="from-cyan-900 to-cyan-700"
          kicker={tCommon("tabCroisieres")}
          title={t("croisieresTitle")}
          subtitle={t("croisieresDescription")}
        />
        <ModuleBackHomeLink label={t("backToHome")} />
      </main>
      <Footer />
    </div>
  )
}
