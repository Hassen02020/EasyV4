import { getTranslations, getLocale } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
  type LegalSection,
} from "@/components/legal/legal-page-layout"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Mentions Légales | Easy2Book",
  description:
    "Mentions légales Easy2Book — agence de voyage agréée en Tunisie.",
  alternates: { languages: buildLanguageAlternates("/mentions-legales") },
}

/**
 * Contenu réel FR — LEGAL-CONTENT-REAL-01, fourni par l'équipe Easy2Book
 * (2026-10-26), explicitement non vérifié juridiquement ni auprès d'un
 * registre officiel. Les champs "à confirmer"/"à compléter" sont repris
 * tels quels — aucune donnée inventée. EN/AR restent sur le placeholder
 * générique (LOREM) tant que ces versions n'auront pas été préparées
 * séparément, après validation de la version française.
 */
const FR_INTRO =
  "Le site et la plateforme Easy2Book sont exploités par une société dont la forme juridique communiquée est SUARL. La raison sociale exacte doit être insérée après confirmation."

const FR_SECTIONS: LegalSection[] = [
  {
    heading: "1. Éditeur du site",
    paragraphs: [
      "• Marque commerciale : Easy2Book",
      "• Forme juridique : SUARL (à confirmer sur les documents officiels)",
      "• Siège social : Avenue 28 Mars, Siliana, Tunisie (adresse communiquée, à confirmer)",
      "• Matricule fiscal : 1980613K (à vérifier)",
      "• Numéro RNE : à compléter, le cas échéant",
      "• Capital social : à compléter",
      "• Agrément/licence touristique : à préciser si applicable",
      "• Responsable de publication : à compléter",
    ],
  },
  {
    heading: "2. Contact",
    paragraphs: ["E-mail : info@easy2book.tn", "Téléphone : +216 98 140 514"],
  },
  {
    heading: "3. Hébergement",
    paragraphs: [
      "Nom légal de l'hébergeur, adresse et coordonnées : à compléter à partir des informations contractuelles exactes du service d'hébergement.",
    ],
  },
  {
    heading: "4. Activité de la plateforme",
    paragraphs: [
      "Easy2Book est une plateforme numérique dédiée à la recherche et à la commercialisation de prestations de voyage. Le rôle exact d'Easy2Book pour chaque réservation (vendeur, intermédiaire, distributeur ou autre) doit être indiqué conformément aux contrats et au fonctionnement réel du service. Les prestations peuvent être exécutées par des fournisseurs ou partenaires distincts.",
    ],
  },
  {
    heading: "5. Propriété intellectuelle et mise à jour",
    paragraphs: [
      "Les éléments du site, notamment les textes, éléments graphiques, marques, logos et interfaces, sont protégés par les règles applicables. Toute utilisation non autorisée peut être interdite. Les présentes mentions peuvent être mises à jour lorsque les informations de l'éditeur ou du site changent.",
    ],
  },
]

const FR_NOTICE =
  "Projet de rédaction non vérifié juridiquement. Les informations d'identification (raison sociale, adresse, matricule fiscal) sont reprises telles que communiquées, non vérifiées auprès d'un registre officiel. Ne pas considérer ce texte comme un engagement contractuel définitif."

export default async function MentionsLegalesPage() {
  const [t, locale] = await Promise.all([getTranslations("Legal"), getLocale()])

  if (locale === "fr") {
    return (
      <LegalPageLayout
        title={t("mentionsLegalesTitle")}
        intro={FR_INTRO}
        sections={FR_SECTIONS}
        noticeOverride={FR_NOTICE}
      />
    )
  }

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
