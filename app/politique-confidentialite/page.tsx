import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Politique de Confidentialité | Easy2Book",
  description: "Politique de confidentialité et protection des données Easy2Book.",
}

export default function PolitiqueConfidentialitePage() {
  return (
    <LegalPageLayout
      title="Politique de Confidentialité"
      intro={LOREM}
      sections={[
        { heading: "1. Données collectées", paragraphs: [LOREM_2] },
        { heading: "2. Finalités du traitement", paragraphs: [LOREM, LOREM_2] },
        { heading: "3. Partage des données", paragraphs: [LOREM_2] },
        { heading: "4. Durée de conservation", paragraphs: [LOREM] },
        { heading: "5. Vos droits", paragraphs: [LOREM_2] },
        { heading: "6. Cookies", paragraphs: [LOREM] },
        { heading: "7. Contact", paragraphs: [LOREM_2] },
      ]}
    />
  )
}
