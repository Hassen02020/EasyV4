/**
 * Inngest Function — processWalletCustomerCredited
 *
 * Déclenchée par "wallet/customer.credited" (B2C-WALLET-EMAIL-01).
 * Envoie un email de confirmation au client B2C après la validation
 * de sa recharge wallet via Paymee.
 *
 * Symétrie B2B : process-wallet-credit.ts envoie la même confirmation
 * à l'agence partenaire pour le wallet B2B.
 *
 * L'email est résolu en interne depuis le customerId (DB lookup) —
 * jamais passé en clair dans l'event pour éviter toute dérive.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import { customers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { Resend } from "resend"

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export const processWalletCustomerCredited = inngest.createFunction(
  {
    id: "process-wallet-customer-credited",
    name: "Wallet Client B2C — Email confirmation recharge",
    retries: 3,
    triggers: { event: "wallet/customer.credited" },
    onFailure: makeOnFailure("process-wallet-customer-credited"),
  },
  async ({
    event,
  }: {
    event: { data: Events["wallet/customer.credited"]["data"] }
  }) => {
    const { customerId, txId, amount, newBalance } = event.data

    const [customer] = await withSystemContext((db) =>
      db
        .select({
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1),
    )

    if (!customer?.email) {
      return { skipped: true, reason: "no_customer_email", customerId }
    }

    if (!process.env.RESEND_API_KEY) {
      return { skipped: true, reason: "resend_not_configured", customerId }
    }

    const customerName =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
      "Client"

    const accountUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://easy2book.tn"}/compte/wallet`

    const resend = getResend()
    const { error } = await resend.emails.send({
      from: "Easy2Book <noreply@easy2book.tn>",
      to: customer.email,
      subject: `✅ Votre wallet a été crédité — +${amount.toFixed(3)} DT`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #059669;">✅ Recharge confirmée</h2>
          <p>Bonjour <strong>${customerName}</strong>,</p>
          <p>Votre wallet Easy2Book a été crédité avec succès.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Montant crédité</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; text-align: right; color: #059669;">+${amount.toFixed(3)} DT</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Nouveau solde</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 700; text-align: right;">${newBalance.toFixed(3)} DT</td>
            </tr>
            <tr>
              <td style="padding: 8px; color: #6b7280;">Réf. transaction</td>
              <td style="padding: 8px; font-family: monospace; text-align: right;">${txId.slice(0, 8).toUpperCase()}</td>
            </tr>
          </table>
          <p>
            <a href="${accountUrl}" style="display: inline-block; padding: 10px 20px; background: #059669; color: white; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Voir mon wallet
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Easy2Book — Votre portefeuille de voyage</p>
        </div>
      `,
    })

    if (error) {
      console.error("[process-wallet-customer-credited] envoi email échoué", {
        customerId,
        txId,
        error: error.message,
      })
      return { success: false, reason: "email_send_failed", customerId }
    }

    return { success: true, customerId, amount }
  },
)
