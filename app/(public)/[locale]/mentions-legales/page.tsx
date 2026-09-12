import { getTranslations } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Mentions Légales | Easy2Book",
  description: "Mentions légales Easy2Book — agence de voyage agréée en Tunisie.",
  alternates: { languages: buildLanguageAlternates("/mentions-legales") },
}

export default async function MentionsLegalesPage() {
  const t = await getTranslations("Legal")
  return (
    <LegalPageLayout
      title={t("mentionsLegalesTitle")}
      intro={LOREM}
      sections={[
        { heading: t("mlEditeur"), paragraphs: [LOREM_2] },
        { heading: t("mlHebergement"), paragraphs: [LOREM] },
        { heading: t("mlAgrement"), paragraphs: [LOREM_2] },
        { heading: t("mlPropriete"), paragraphs: [LOREM] },
        { heading: t("mlContact"), paragraphs: [LOREM_2] },
      ]}
    />
  )
}
