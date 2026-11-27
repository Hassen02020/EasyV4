/**
 * Module Bateaux & Croisières — /croisieres
 *
 * PUBLIC-NAV-VISA-CROISIERES-01 : page provisoire, pas de fonctionnalité de
 * réservation (aucun backend croisières dans le projet à ce jour).
 * UI-LOT3A : gabarit commun ModuleComingSoon (hero de marque, statut, contacts
 * réels de l'agence) — aucune date ni fonctionnalité fictive.
 */

import { getTranslations } from "next-intl/server"
import { Ship } from "lucide-react"
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
    <ModuleComingSoon
      Icon={Ship}
      title={t("croisieresTitle")}
      description={t("croisieresDescription")}
    />
  )
}
