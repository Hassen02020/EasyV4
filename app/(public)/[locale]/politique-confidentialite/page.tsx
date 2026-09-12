import { getTranslations } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Politique de Confidentialité | Easy2Book",
  description: "Politique de confidentialité et protection des données Easy2Book.",
}

export default async function PolitiqueConfidentialitePage() {
  const t = await getTranslations("Legal")
  return (
    <LegalPageLayout
      title={t("politiqueTitle")}
      intro={LOREM}
      sections={[
        { heading: t("pcDonnees"), paragraphs: [LOREM_2] },
        { heading: t("pcFinalites"), paragraphs: [LOREM, LOREM_2] },
        { heading: t("pcPartage"), paragraphs: [LOREM_2] },
        { heading: t("pcDuree"), paragraphs: [LOREM] },
        { heading: t("pcDroits"), paragraphs: [LOREM_2] },
        { heading: t("pcCookies"), paragraphs: [LOREM] },
        { heading: t("pcContact"), paragraphs: [LOREM_2] },
      ]}
    />
  )
}
