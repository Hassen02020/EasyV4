/**
 * Email sender — Voucher Hôtel via Resend.
 *
 * Appelé depuis la fonction Inngest processConfirmedBooking (arrière-plan).
 * Le PDF est transmis en base64 pour éviter les problèmes de sérialisation.
 */

import { Resend } from "resend"
import { renderVoucherEmailHtml } from "./templates/voucher-email"

// Lazy initialization pour éviter l'erreur au build
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export interface SendVoucherEmailInput {
  to: string
  customerName: string
  publicRef: string
  hotelName: string
  checkIn: string
  checkOut: string
  nights: number
  pdfBase64: string
}

/**
 * Envoie l'email de voucher avec PDF en pièce jointe.
 * Throws on failure (retried par Inngest).
 */
export async function sendVoucherEmail(input: SendVoucherEmailInput): Promise<void> {
  const {
    to,
    customerName,
    publicRef,
    hotelName,
    checkIn,
    checkOut,
    nights,
    pdfBase64,
  } = input

  const html = renderVoucherEmailHtml({
    customerName,
    publicRef,
    hotelName,
    checkIn,
    checkOut,
    nights,
  })

  const resend = getResend()
  const { error } = await resend.emails.send({
    from: "Easy2Book <noreply@easy2book.tn>",
    to,
    subject: `Votre voucher hôtel — ${hotelName} (${publicRef})`,
    html,
    attachments: [
      {
        filename: `voucher-${publicRef}.pdf`,
        content: pdfBase64, // Resend accepte base64 string
      },
    ],
  })

  if (error) {
    throw new Error(`Resend error: ${error.message}`)
  }
}
