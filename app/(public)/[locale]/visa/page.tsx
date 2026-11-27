/**
 * Module Visa — /visa
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend Visa dans le projet à ce jour).
 * UI-LOT3A : gabarit commun ModuleComingSoon (hero de marque, statut, contacts
 * réels de l'agence) — aucune date ni fonctionnalité fictive.
 */

import { getTranslations } from "next-intl/server"
import { Stamp } from "lucide-react"
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
    <ModuleComingSoon
      Icon={Stamp}
      title={t("visaTitle")}
      description={t("visaDescription")}
    />
  )
}
