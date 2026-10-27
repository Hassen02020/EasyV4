/**
 * Module Bateaux & Croisières — /croisieres
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend croisières dans le projet à ce jour).
 */

import { getTranslations } from "next-intl/server"
import { Ship } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleComingSoon } from "@/components/module-coming-soon"
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
  const t = await getTranslations("ModulePlaceholder")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ModuleComingSoon
        icon={Ship}
        title={t("croisieresTitle")}
        description={t("croisieresDescription")}
        backHomeLabel={t("backToHome")}
      />
      <Footer />
    </div>
  )
}
