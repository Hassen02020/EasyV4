import { getTranslations, getLocale } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
  type LegalSection,
} from "@/components/legal/legal-page-layout"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Politique de Confidentialité | Easy2Book",
  description:
    "Politique de confidentialité et protection des données Easy2Book.",
  alternates: {
    languages: buildLanguageAlternates("/politique-confidentialite"),
  },
}

/**
 * Contenu réel FR — LEGAL-CONTENT-REAL-01, fourni par l'équipe Easy2Book
 * (2026-10-26), explicitement non vérifié juridiquement. EN/AR restent sur
 * le placeholder générique (LOREM) tant que ces versions n'auront pas été
 * préparées séparément, après validation de la version française.
 */
const FR_INTRO =
  "La présente politique décrit la manière dont Easy2Book traite les données personnelles des utilisateurs de la plateforme. Elle est un projet de rédaction et doit être complétée et validée avant publication définitive."

const FR_SECTIONS: LegalSection[] = [
  {
    heading: "1. Responsable du traitement",
    paragraphs: [
      "Le responsable du traitement est l'entité juridique qui exploite Easy2Book. Sa raison sociale exacte et son adresse officielle doivent être confirmées. Contact : info@easy2book.tn ; téléphone : +216 98 140 514.",
    ],
  },
  {
    heading: "2. Catégories de données susceptibles d'être traitées",
    paragraphs: [
      "Selon les fonctionnalités utilisées, Easy2Book peut traiter des données d'identification et de contact, les informations nécessaires aux réservations, les préférences de voyage, les échanges avec l'assistance, les références et statuts de paiement, ainsi que certaines données techniques (journaux de connexion, données de sécurité et informations sur l'appareil ou le navigateur). Les données réellement collectées doivent être inventoriées avant publication.",
    ],
  },
  {
    heading: "3. Finalités et bases du traitement",
    paragraphs: [
      "Les données peuvent être utilisées pour créer et gérer un compte lorsqu'il existe, rechercher et traiter une réservation, communiquer avec le client, gérer les paiements et demandes d'assistance, prévenir la fraude, assurer la sécurité, respecter les obligations légales et améliorer le service. Les bases juridiques applicables (exécution d'un contrat, obligation légale, intérêt légitime ou consentement, selon le cas) doivent être déterminées pour chaque finalité.",
    ],
  },
  {
    heading: "4. Destinataires",
    paragraphs: [
      "Les données peuvent être communiquées, dans la mesure nécessaire, aux fournisseurs de voyage concernés, partenaires de distribution, prestataires de paiement, hébergeurs et prestataires techniques, ainsi qu'aux autorités habilitées lorsque la loi l'exige. La liste des catégories de destinataires et des prestataires réellement utilisés doit être vérifiée.",
    ],
  },
  {
    heading: "5. Durées de conservation",
    paragraphs: [
      "Les durées de conservation doivent être définies par catégorie de données, selon la finalité, les obligations comptables et légales, les délais de réclamation et les besoins de sécurité. Les durées exactes doivent être ajoutées avant publication.",
    ],
  },
  {
    heading: "6. Sécurité",
    paragraphs: [
      "Easy2Book met en œuvre des mesures techniques et organisationnelles adaptées pour protéger les données contre l'accès non autorisé, la perte, l'altération ou la divulgation. Aucune mesure ne peut garantir une sécurité absolue.",
    ],
  },
  {
    heading: "7. Droits des personnes",
    paragraphs: [
      "Selon la législation applicable, les personnes peuvent disposer de droits d'accès, de rectification, d'effacement, de limitation, d'opposition et, lorsque le traitement repose sur le consentement, de retrait de celui-ci. Les modalités d'exercice, les délais de réponse et l'autorité compétente doivent être confirmés selon le droit tunisien applicable. Les demandes peuvent être adressées à Direction@easy2book.tn. La procédure de suppression des données (délai, données conservées, confirmation) est décrite sur la page « Suppression des données ».",
    ],
  },
  {
    heading: "8. Cookies et technologies similaires",
    paragraphs: [
      "Le site peut utiliser des cookies ou technologies similaires nécessaires à son fonctionnement, à la sécurité ou à d'autres finalités. Les technologies non essentielles doivent être décrites et, lorsque la loi l'exige, soumises au choix préalable de l'utilisateur. Un inventaire réel des cookies et traceurs est nécessaire avant publication.",
    ],
  },
  {
    heading: "9. Transferts internationaux",
    paragraphs: [
      "Si des données sont hébergées ou accessibles depuis un autre pays, les transferts doivent être identifiés et encadrés conformément aux règles applicables. Les pays, prestataires et garanties éventuelles doivent être précisés après audit technique et contractuel.",
    ],
  },
  {
    heading: "10. Modifications et contact",
    paragraphs: [
      "Cette politique peut être mise à jour pour refléter les changements du service ou des obligations légales. La date de dernière mise à jour doit être indiquée. Pour toute question, contactez info@easy2book.tn ou +216 98 140 514.",
    ],
  },
]

const FR_NOTICE =
  "Projet de rédaction non vérifié juridiquement. L'inventaire des données, cookies, prestataires, transferts et durées de conservation reste à compléter avant publication définitive. Ne pas considérer ce texte comme un engagement contractuel définitif."

export default async function PolitiqueConfidentialitePage() {
  const [t, locale] = await Promise.all([getTranslations("Legal"), getLocale()])

  if (locale === "fr") {
    return (
      <LegalPageLayout
        title={t("politiqueTitle")}
        intro={FR_INTRO}
        sections={FR_SECTIONS}
        noticeOverride={FR_NOTICE}
      />
    )
  }

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
