import { getTranslations, getLocale } from "next-intl/server"
import {
  LegalPageLayout,
  LOREM,
  LOREM_2,
  type LegalSection,
} from "@/components/legal/legal-page-layout"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Conditions Générales de Vente | Easy2Book",
  description: "Conditions générales de vente Easy2Book.",
  alternates: { languages: buildLanguageAlternates("/cgv") },
}

/**
 * Contenu réel FR — LEGAL-CONTENT-REAL-01, fourni par l'équipe Easy2Book
 * (2026-10-26), explicitement non vérifié juridiquement. EN/AR restent sur
 * le placeholder générique (LOREM) tant que ces versions n'auront pas été
 * préparées séparément, après validation de la version française.
 */
const FR_INTRO =
  "Les présentes conditions définissent le cadre général d'utilisation des services de réservation proposés sur la plateforme Easy2Book. Des conditions particulières peuvent s'appliquer selon la prestation, le fournisseur, la destination et le tarif sélectionné. En cas de contradiction, les conditions particulières communiquées avant la commande doivent être examinées avec les présentes conditions."

const FR_SECTIONS: LegalSection[] = [
  {
    heading: "1. Objet et champ d'application",
    paragraphs: [
      "Les présentes conditions définissent le cadre général d'utilisation des services de réservation proposés sur la plateforme Easy2Book. Des conditions particulières peuvent s'appliquer selon la prestation, le fournisseur, la destination et le tarif sélectionné. En cas de contradiction, les conditions particulières communiquées avant la commande doivent être examinées avec les présentes conditions.",
    ],
  },
  {
    heading: "2. Rôle d'Easy2Book et fournisseurs",
    paragraphs: [
      "Selon le produit réservé, Easy2Book peut intervenir comme vendeur, intermédiaire ou distributeur. Le rôle exact doit être indiqué au client avant la confirmation. La prestation peut être exécutée par un hôtel, transporteur, organisateur, agence ou autre fournisseur tiers. Les conditions propres à ce fournisseur doivent être présentées au client lorsqu'elles s'appliquent.",
    ],
  },
  {
    heading: "3. Recherche, commande et confirmation",
    paragraphs: [
      "Le client doit vérifier les informations essentielles avant de valider une commande : dates, destination, voyageurs, noms, conditions tarifaires, services inclus et exclusions. Une demande de réservation n'est considérée comme confirmée qu'après la confirmation indiquée par la plateforme ou le fournisseur et, lorsque cela est requis, après validation du paiement.",
    ],
  },
  {
    heading: "4. Prix et paiement",
    paragraphs: [
      "Le prix affiché doit correspondre aux éléments connus au moment de la commande et préciser, dans la mesure applicable, les taxes, frais et services inclus. Les moyens de paiement proposés sont ceux affichés lors du parcours de réservation. Une recharge de portefeuille, lorsqu'elle est proposée, est distincte du paiement d'une réservation et obéit aux conditions affichées au moment de l'opération. Aucun moyen de paiement non effectivement disponible ne doit être annoncé.",
    ],
  },
  {
    heading: "5. Modification, annulation et remboursement",
    paragraphs: [
      "Les possibilités de modification, d'annulation et de remboursement dépendent du tarif acheté, de la prestation et des conditions du fournisseur, qui doivent être présentées avant la validation de la commande. Certains tarifs peuvent être non remboursables. Les frais et délais applicables doivent être communiqués avant que le client ne confirme sa demande. Aucun remboursement ne doit être promis lorsqu'il n'est pas prévu par les conditions applicables ou par la loi.",
    ],
  },
  {
    heading: "6. Obligations du client",
    paragraphs: [
      "Le client s'engage à fournir des informations exactes, à vérifier les noms et dates, à respecter les exigences documentaires et les règles du fournisseur, et à conserver les confirmations et justificatifs utiles. Il lui appartient de vérifier les formalités d'entrée, de transit, de santé et de voyage auprès des autorités compétentes.",
    ],
  },
  {
    heading: "7. Réclamations et assistance",
    paragraphs: [
      "Pour toute question relative à une réservation, un paiement, une modification ou une annulation, le client peut contacter Easy2Book à info@easy2book.tn ou au +216 98 140 514. Il est recommandé d'indiquer la référence de réservation et de joindre les justificatifs utiles. Le client ne doit pas transmettre de mot de passe ni de données bancaires confidentielles par courrier électronique.",
    ],
  },
  {
    heading: "8. Responsabilité et événements exceptionnels",
    paragraphs: [
      "Les responsabilités respectives d'Easy2Book et des fournisseurs dépendent du rôle réellement assumé pour la prestation et des règles légales applicables. Les retards, annulations, perturbations ou événements indépendants de la volonté des parties sont traités conformément aux conditions du fournisseur et à la législation applicable. Cette clause ne limite pas les droits impératifs du consommateur.",
    ],
  },
  {
    heading: "9. Données personnelles",
    paragraphs: [
      "Les données personnelles sont traitées conformément à la politique de confidentialité d'Easy2Book, qui doit être consultable avant ou lors de la collecte des données. Les données nécessaires à la réservation peuvent être transmises aux fournisseurs concernés et aux prestataires techniques ou de paiement, dans la mesure nécessaire à l'exécution du service et conformément aux règles applicables.",
    ],
  },
  {
    heading: "10. Propriété intellectuelle et usage de la plateforme",
    paragraphs: [
      "Les contenus, signes distinctifs et éléments de la plateforme sont protégés par les règles applicables. Le client s'engage à ne pas perturber le fonctionnement du site, contourner ses mesures de sécurité ou utiliser la plateforme à des fins illicites.",
    ],
  },
  {
    heading: "11. Droit applicable et différends",
    paragraphs: [
      "Le droit applicable, les autorités compétentes et les modalités de règlement des différends doivent être confirmés par un professionnel du droit tunisien, en tenant compte des règles impératives de protection des consommateurs et des situations transfrontalières. Rien dans les présentes conditions ne prive le client des droits qui lui sont accordés par une disposition impérative.",
    ],
  },
  {
    heading: "12. Mise à jour des conditions",
    paragraphs: [
      "Easy2Book peut mettre à jour les présentes conditions lorsque cela est nécessaire. La version applicable à une commande doit être identifiable et conservée avec les informations de la réservation. Les modifications ne doivent pas supprimer rétroactivement les droits déjà acquis par le client.",
    ],
  },
]

const FR_NOTICE =
  "Version de travail — les règles commerciales doivent être alignées sur les contrats fournisseurs et la réglementation applicable. Ce texte n'a pas été validé par un professionnel du droit tunisien et ne constitue pas un engagement contractuel définitif."

export default async function CgvPage() {
  const [t, locale] = await Promise.all([getTranslations("Legal"), getLocale()])

  if (locale === "fr") {
    return (
      <LegalPageLayout
        title={t("cgvTitle")}
        intro={FR_INTRO}
        sections={FR_SECTIONS}
        noticeOverride={FR_NOTICE}
      />
    )
  }

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
