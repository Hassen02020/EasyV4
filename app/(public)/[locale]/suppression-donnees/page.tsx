import { getLocale } from "next-intl/server"
import { LegalPageLayout } from "@/components/legal/legal-page-layout"
import { dataDeletionContent } from "@/lib/legal/data-deletion-content"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Suppression des données | Easy2Book",
  description:
    "Comment demander la suppression de vos données personnelles détenues par Easy2Book.",
  alternates: { languages: buildLanguageAlternates("/suppression-donnees") },
}

/** LEGAL-DATA-DELETION-01 — contenu : lib/legal/data-deletion-content.ts */
export default async function SuppressionDonneesPage() {
  const c = dataDeletionContent(await getLocale())
  return (
    <LegalPageLayout
      title={c.title}
      intro={c.intro}
      sections={c.sections}
      noticeOverride={c.notice}
      lastUpdated={c.updated}
    />
  )
}
