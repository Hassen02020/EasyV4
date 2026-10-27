/**
 * Module Visa — /visa
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend Visa dans le projet à ce jour).
 * VISA-CROISIERES-HERO-CONCEPT-01 : même gabarit ModuleHero que les modules
 * réels (Attractions, Omra, Vols, ...), sans formulaire de recherche (pas de
 * fonctionnalité fictive) ni image de bannière inventée (dégradé seul).
 */

import { getTranslations } from "next-intl/server"
import { Stamp } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { ModuleBackHomeLink } from "@/components/module-back-home-link"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export async function generateMetadata() {
  const t = await getTranslations("ModulePlaceholder")
  return {
    title: `${t("visaTitle")} | Easy2Book`,
    description: t("visaDescription"),
    alternates: { languages: buildLanguageAlternates("/visa") },
  }
}

export default async function VisaPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("ModulePlaceholder"),
    getTranslations("Common"),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Stamp}
          gradient="from-zinc-900 to-zinc-700"
          kicker={tCommon("tabVisa")}
          title={t("visaTitle")}
          subtitle={t("visaDescription")}
        />
        <ModuleBackHomeLink label={t("backToHome")} />
      </main>
      <Footer />
    </div>
  )
}
