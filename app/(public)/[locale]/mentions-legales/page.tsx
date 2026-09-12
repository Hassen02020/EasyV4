import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
} from "@/components/legal/legal-page-layout"

export const metadata = {
  title: "Mentions Légales | Easy2Book",
  description: "Mentions légales Easy2Book — agence de voyage agréée en Tunisie.",
}

export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout
      title="Mentions Légales"
      intro={LOREM}
      sections={[
        { heading: "1. Éditeur du site", paragraphs: [LOREM_2] },
        { heading: "2. Hébergement", paragraphs: [LOREM] },
        { heading: "3. Agrément et immatriculation", paragraphs: [LOREM_2] },
        { heading: "4. Propriété intellectuelle", paragraphs: [LOREM] },
        { heading: "5. Contact", paragraphs: [LOREM_2] },
      ]}
    />
  )
}
