/**
 * CAMPAIGN-DELIVERY-01 — envoi email de campagne CRM via Resend.
 *
 * Contrairement aux emails de réservation (voucher avec PDF), un email
 * de campagne est du texte libre défini par le commercial à la création
 * de la campagne. Pas de template Resend obligatoire côté Meta — Resend
 * accepte du HTML libre en texte marketing.
 *
 * Honnêteté si RESEND_API_KEY absent : erreur explicite, jamais faux succès.
 */

import { Resend } from "resend"
import { renderCampaignEmailHtml } from "./templates/campaign-email"

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export interface SendCampaignEmailInput {
  to: string
  campaignName: string
  message: string
  agencyName?: string
}

export async function sendCampaignEmail(
  input: SendCampaignEmailInput,
): Promise<void> {
  const html = renderCampaignEmailHtml({
    campaignName: input.campaignName,
    message: input.message,
    agencyName: input.agencyName,
  })

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: "Easy2Book <noreply@easy2book.tn>",
    to: input.to,
    subject: input.campaignName,
    html,
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }
}
