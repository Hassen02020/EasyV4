import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Conditions Générales de Vente | Easy2Book",
  description: "Conditions générales de vente Easy2Book.",
}

export default function CgvPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales de Vente"
      intro={LOREM}
      sections={[
        { heading: "1. Objet", paragraphs: [LOREM_2] },
        { heading: "2. Réservations et paiement", paragraphs: [LOREM, LOREM_2] },
        { heading: "3. Modification et annulation", paragraphs: [LOREM_2] },
        { heading: "4. Responsabilités", paragraphs: [LOREM] },
        { heading: "5. Réclamations et litiges", paragraphs: [LOREM_2] },
        { heading: "6. Droit applicable", paragraphs: [LOREM] },
      ]}
    />
  )
}
