/**
 * Module Visa — /visa
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend Visa dans le projet à ce jour).
 */

import { getTranslations } from "next-intl/server"
import { Stamp } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleComingSoon } from "@/components/module-coming-soon"
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
  const t = await getTranslations("ModulePlaceholder")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ModuleComingSoon
        icon={Stamp}
        title={t("visaTitle")}
        description={t("visaDescription")}
        backHomeLabel={t("backToHome")}
      />
      <Footer />
    </div>
  )
}
