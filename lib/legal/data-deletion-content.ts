import type { LegalSection } from "@/components/legal/legal-page-layout"

/**
 * LEGAL-DATA-DELETION-01 — page « instructions de suppression des données »
 * exigée par Meta (Messenger, Instagram, Lead Ads) pour publier l'application.
 *
 * Informations fournies et validées par la direction d'Easy2Book le
 * 2026-10-31 : responsable, adresse, adresse de demande, personne en charge,
 * délai de 5 jours, conservation des factures 1 an, confirmation par email.
 * Aucune donnée inventée. Texte non vérifié par un juriste.
 *
 * Procédure réelle : il n'existe pas encore d'outil d'anonymisation dans
 * l'administration ; chaque demande est traitée manuellement par la
 * personne désignée.
 */
export const DATA_DELETION = {
  controller: "SUARL Easy2Book",
  address: "28 avenue de Bizerte, 6100 Siliana, Tunisie",
  email: "Direction@easy2book.tn",
  handler: "M. Hassen Tarhouni",
  maxDays: 5,
  invoiceRetention: "1 an",
  lastUpdated: "2026-10-31",
} as const

const D = DATA_DELETION

export type DataDeletionContent = {
  title: string
  updated: string
  notice: string
  intro: string
  sections: LegalSection[]
}

const CONTENT: Record<"fr" | "en" | "ar", DataDeletionContent> = {
  fr: {
    title: "Suppression de vos données",
    updated: `Dernière mise à jour : 31 octobre 2026`,
    notice: `Vous pouvez demander à tout moment la suppression de vos données. Délai de traitement : ${D.maxDays} jours maximum.`,
    intro: `Cette page explique comment demander la suppression des données personnelles que ${D.controller} détient sur vous, notamment lorsque vous nous avez contactés par Facebook, Messenger ou Instagram.`,
    sections: [
      {
        heading: "1. Responsable du traitement",
        paragraphs: [`${D.controller}, ${D.address}.`, `Contact : ${D.email}`],
      },
      {
        heading: "2. Données concernées",
        paragraphs: [
          "Lorsque vous nous contactez par Facebook Messenger, Instagram, un formulaire publicitaire Facebook ou Instagram, WhatsApp, email ou notre site, nous enregistrons votre nom, vos coordonnées, l'identifiant de votre compte sur la plateforme concernée, ainsi que le contenu de vos messages et de vos demandes.",
        ],
      },
      {
        heading: "3. Comment faire une demande",
        paragraphs: [
          `Envoyez un email à ${D.email} avec pour objet « Suppression de mes données ».`,
          "Indiquez le nom et le canal que vous avez utilisés pour nous contacter (par exemple votre nom de profil Facebook ou Instagram, ou votre numéro de téléphone). Nous pouvons vous demander de confirmer votre identité avant de traiter la demande.",
        ],
      },
      {
        heading: "4. Traitement et délai",
        paragraphs: [
          `La demande est traitée par ${D.handler}, dans un délai maximum de ${D.maxDays} jours à compter de sa réception.`,
        ],
      },
      {
        heading: "5. Ce qui est supprimé",
        paragraphs: [
          "Vos coordonnées, vos conversations, vos messages et vos demandes de contact.",
        ],
      },
      {
        heading: "6. Ce qui est conservé",
        paragraphs: [
          `Les factures liées à une réservation payée sont conservées pendant ${D.invoiceRetention}, puis supprimées.`,
        ],
      },
      {
        heading: "7. Confirmation",
        paragraphs: [
          `Une fois la suppression effectuée, vous recevez un email de confirmation envoyé depuis ${D.email}.`,
        ],
      },
      {
        heading: "8. Données détenues par Meta",
        paragraphs: [
          "Cette procédure couvre les données détenues par Easy2Book. Les données conservées par Facebook ou Instagram eux-mêmes relèvent de leurs propres paramètres de confidentialité.",
        ],
      },
    ],
  },
  en: {
    title: "Deleting your data",
    updated: "Last updated: 31 October 2026",
    notice: `You can ask us to delete your data at any time. Processing time: ${D.maxDays} days maximum.`,
    intro: `This page explains how to request the deletion of the personal data that ${D.controller} holds about you, in particular when you contacted us through Facebook, Messenger or Instagram.`,
    sections: [
      {
        heading: "1. Data controller",
        paragraphs: [`${D.controller}, ${D.address}.`, `Contact: ${D.email}`],
      },
      {
        heading: "2. Data concerned",
        paragraphs: [
          "When you contact us through Facebook Messenger, Instagram, a Facebook or Instagram lead form, WhatsApp, email or our website, we record your name, your contact details, your account identifier on the platform concerned, and the content of your messages and requests.",
        ],
      },
      {
        heading: "3. How to make a request",
        paragraphs: [
          `Send an email to ${D.email} with the subject "Delete my data".`,
          "State the name and the channel you used to contact us (for example your Facebook or Instagram profile name, or your phone number). We may ask you to confirm your identity before processing the request.",
        ],
      },
      {
        heading: "4. Processing and time limit",
        paragraphs: [
          `Requests are handled by ${D.handler.replace("M. ", "Mr ")}, within ${D.maxDays} days of receipt at most.`,
        ],
      },
      {
        heading: "5. What is deleted",
        paragraphs: [
          "Your contact details, conversations, messages and contact requests.",
        ],
      },
      {
        heading: "6. What is kept",
        paragraphs: [
          "Invoices related to a paid booking are kept for 1 year, then deleted.",
        ],
      },
      {
        heading: "7. Confirmation",
        paragraphs: [
          `Once the deletion is done, you receive a confirmation email sent from ${D.email}.`,
        ],
      },
      {
        heading: "8. Data held by Meta",
        paragraphs: [
          "This procedure covers the data held by Easy2Book. Data kept by Facebook or Instagram themselves is governed by their own privacy settings.",
        ],
      },
    ],
  },
  ar: {
    title: "حذف بياناتك",
    updated: "آخر تحديث: 31 أكتوبر 2026",
    notice: `يمكنك في أي وقت طلب حذف بياناتك. مدة المعالجة: ${D.maxDays} أيام كحد أقصى.`,
    intro: `توضح هذه الصفحة كيفية طلب حذف البيانات الشخصية التي تحتفظ بها ${D.controller} عنك، خاصة إذا تواصلت معنا عبر فيسبوك أو ماسنجر أو إنستغرام.`,
    sections: [
      {
        heading: "1. المسؤول عن المعالجة",
        paragraphs: [
          `${D.controller}، 28 شارع بنزرت، 6100 سليانة، تونس.`,
          `للتواصل: ${D.email}`,
        ],
      },
      {
        heading: "2. البيانات المعنية",
        paragraphs: [
          "عندما تتواصل معنا عبر ماسنجر فيسبوك أو إنستغرام أو استمارة إعلانية على فيسبوك أو إنستغرام أو واتساب أو البريد الإلكتروني أو موقعنا، نسجل اسمك ووسائل الاتصال بك ومعرّف حسابك على المنصة المعنية ومحتوى رسائلك وطلباتك.",
        ],
      },
      {
        heading: "3. كيفية تقديم الطلب",
        paragraphs: [
          `أرسل بريدًا إلكترونيًا إلى ${D.email} بعنوان «حذف بياناتي».`,
          "اذكر الاسم والقناة التي استعملتها للتواصل معنا (مثل اسم حسابك على فيسبوك أو إنستغرام، أو رقم هاتفك). قد نطلب منك تأكيد هويتك قبل معالجة الطلب.",
        ],
      },
      {
        heading: "4. المعالجة والآجال",
        paragraphs: [
          `يتولى السيد حسان الطرهوني معالجة الطلب في أجل أقصاه ${D.maxDays} أيام من تاريخ استلامه.`,
        ],
      },
      {
        heading: "5. ما يتم حذفه",
        paragraphs: ["وسائل الاتصال بك ومحادثاتك ورسائلك وطلبات التواصل."],
      },
      {
        heading: "6. ما يتم الاحتفاظ به",
        paragraphs: [
          "يتم الاحتفاظ بالفواتير المتعلقة بحجز مدفوع لمدة سنة واحدة، ثم تُحذف.",
        ],
      },
      {
        heading: "7. التأكيد",
        paragraphs: [
          `بعد إتمام الحذف، تتلقى رسالة تأكيد عبر البريد الإلكتروني من ${D.email}.`,
        ],
      },
      {
        heading: "8. البيانات التي تحتفظ بها ميتا",
        paragraphs: [
          "يشمل هذا الإجراء البيانات التي تحتفظ بها Easy2Book. أما البيانات التي يحتفظ بها فيسبوك أو إنستغرام نفساهما فتخضع لإعدادات الخصوصية الخاصة بهما.",
        ],
      },
    ],
  },
}

export function dataDeletionContent(locale: string): DataDeletionContent {
  return CONTENT[locale === "en" || locale === "ar" ? locale : "fr"]
}
