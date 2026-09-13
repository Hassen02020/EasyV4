import { getTranslations } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Conditions Générales de Vente | Easy2Book",
  description: "Conditions générales de vente Easy2Book.",
  alternates: { languages: buildLanguageAlternates("/cgv") },
}

export default async function CgvPage() {
  const t = await getTranslations("Legal")
  return (
    <LegalPageLayout
      title={t("cgvTitle")}
      intro={LOREM}
      sections={[
        { heading: t("cgvObjet"), paragraphs: [LOREM_2] },
        { heading: t("cgvReservations"), paragraphs: [LOREM, LOREM_2] },
        { heading: t("cgvModification"), paragraphs: [LOREM_2] },
        { heading: t("cgvResponsabilites"), paragraphs: [LOREM] },
        { heading: t("cgvReclamations"), paragraphs: [LOREM_2] },
        { heading: t("cgvDroit"), paragraphs: [LOREM] },
      ]}
    />
  )
}
