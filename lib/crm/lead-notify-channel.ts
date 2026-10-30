/**
 * CRM-LEAD-NOTIFY-CHANNELS-01 (écart G-03) — canaux qui déclenchent l'email
 * interne « nouveau lead » (`crm/lead.created` → processNewLead).
 *
 * La création par l'équipe (/admin, captureStaffLeadCore) n'en fait
 * volontairement PAS partie : c'est l'équipe elle-même qui vient de saisir
 * la demande.
 *
 * Module pur (aucun accès base) : importé par l'email et par les tests.
 */

export const LEAD_NOTIFY_CHANNELS = [
  "website_form",
  "meta_lead_ads",
  "whatsapp",
  "messenger",
  "instagram",
  "email",
] as const

export type LeadNotifyChannel = (typeof LEAD_NOTIFY_CHANNELS)[number]

const CHANNEL_LABEL: Record<LeadNotifyChannel, string> = {
  website_form: "Formulaire du site",
  meta_lead_ads: "Publicité Facebook / Instagram",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  email: "Email",
}

const CHANNEL_INTRO: Record<LeadNotifyChannel, string> = {
  website_form:
    "Un visiteur vient de remplir le formulaire de contact sur votre site.",
  meta_lead_ads:
    "Un prospect vient de remplir le formulaire d'une de vos publicités Facebook / Instagram.",
  whatsapp: "Un nouveau contact vient de vous écrire sur WhatsApp.",
  messenger: "Un nouveau contact vient de vous écrire sur Messenger.",
  instagram:
    "Un nouveau contact vient de vous écrire en message direct sur Instagram.",
  email: "Un nouveau contact vient de vous écrire par email.",
}

/** Événements émis avant ce chantier : sans canal = formulaire du site. */
function resolve(channel: LeadNotifyChannel | null | undefined) {
  return channel && channel in CHANNEL_LABEL ? channel : "website_form"
}

export function leadChannelLabel(
  channel: LeadNotifyChannel | null | undefined,
): string {
  return CHANNEL_LABEL[resolve(channel)]
}

export function leadChannelIntro(
  channel: LeadNotifyChannel | null | undefined,
): string {
  return CHANNEL_INTRO[resolve(channel)]
}
