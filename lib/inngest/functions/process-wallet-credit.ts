/**
 * Inngest Function — processWalletCredit
 *
 * Déclenchée par l'événement "wallet/credited".
 * Envoie une notification email à l'agence confirmant le rechargement.
 */

import { inngest } from "../client"
import { Resend } from "resend"
import { getDb } from "@/lib/db/client"
import { agencies, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Lazy initialization pour éviter l'erreur au build
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export const processWalletCredit = inngest.createFunction(
  {
    id: "process-wallet-credit",
    name: "Process Wallet Credit — Notify Agency",
    retries: 3,
    triggers: { event: "wallet/credited" },
  },
  async ({ event }: any) => {
    const { agencyId, amount, newBalance, method, txId } = event.data

    /* Step 1 — Récupérer les infos agence */
    const db = getDb()
    const [agency] = await db
      .select({
        name: agencies.name,
        email: agencies.contactEmail,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))

    if (!agency?.email) {
      return { success: false, reason: "no_agency_email" }
    }

    /* Step 2 — Envoyer l'email de confirmation rechargement */
    const methodLabel: Record<string, string> = {
      VIREMENT: "virement bancaire",
      MANDAT: "mandat postal",
      CASH: "espèces",
      ZITOUNA_PAY: "Zitouna Pay",
    }

    const resend = getResend()
    await resend.emails.send({
      from: "Easy2Book <noreply@easy2book.tn>",
      to: agency.email!,
      subject: `✅ Wallet rechargé — +${amount.toFixed(3)} DT`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #059669;">✅ Rechargement validé</h2>
          <p>Bonjour <strong>${agency.name}</strong>,</p>
          <p>Votre wallet Easy2Book a été crédité avec succès.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Montant</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; text-align: right;">+${amount.toFixed(3)} DT</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Méthode</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${methodLabel[method] ?? method}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Nouveau solde</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 700; text-align: right; color: #059669;">${newBalance.toFixed(3)} DT</td>
            </tr>
            <tr>
              <td style="padding: 8px; color: #6b7280;">Réf. transaction</td>
              <td style="padding: 8px; font-family: monospace; text-align: right;">${txId.slice(0, 8).toUpperCase()}</td>
            </tr>
          </table>
          <p style="color: #6b7280; font-size: 14px;">Vous pouvez maintenant effectuer des réservations depuis votre espace B2B.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Easy2Book — Plateforme de réservation B2B</p>
        </div>
      `,
    })

    return { success: true, agencyId, amount }
  },
)
