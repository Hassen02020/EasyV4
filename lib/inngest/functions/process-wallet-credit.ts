/**
 * Inngest Function — processWalletCredit
 *
 * Déclenchée par l'événement "wallet/credited".
 * Envoie une notification email à l'agence confirmant le rechargement.
 */

import { inngest, type Events } from "../client"
import { Resend } from "resend"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { makeOnFailure } from "@/lib/inngest/on-failure"

// Lazy initialization pour éviter l'erreur au build
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * Traduit le `method` de l'événement `wallet/credited` en libellé FR.
 * Les seules valeurs réellement émises (voir les 3 appelants de
 * sendEvent("wallet/credited", ...)) sont l'enum `recharge_method` réel
 * (lib/db/schema.ts, cash/bank_transfer/postal_transfer/postal_mandate/
 * check/card_international — lib/finance/recharge-actions.ts::notifyMethod),
 * "ADMIN_DIRECT" (lib/admin/agencies-actions.ts) et "PSP_<PROVIDER>"
 * (app/api/payment/webhook/route.ts). L'ancienne map ne couvrait aucune de
 * ces valeurs (VIREMENT/MANDAT/CASH/ZITOUNA_PAY n'existent nulle part) —
 * l'email affichait donc toujours le code brut au lieu d'un libellé.
 */
const RECHARGE_METHOD_LABEL: Record<string, string> = {
  cash: "espèces",
  bank_transfer: "virement bancaire",
  postal_transfer: "virement postal",
  postal_mandate: "mandat postal",
  check: "chèque",
  card_international: "carte internationale",
  ADMIN_DIRECT: "crédit direct admin",
}

export function resolveWalletCreditMethodLabel(method: string): string {
  if (method in RECHARGE_METHOD_LABEL) return RECHARGE_METHOD_LABEL[method]!
  if (method.startsWith("PSP_")) return `paiement en ligne (${method.slice(4)})`
  return method
}

export const processWalletCredit = inngest.createFunction(
  {
    id: "process-wallet-credit",
    name: "Process Wallet Credit — Notify Agency",
    retries: 3,
    triggers: { event: "wallet/credited" },
    onFailure: makeOnFailure("process-wallet-credit"),
  },
  async ({ event }: { event: { data: Events["wallet/credited"]["data"] } }) => {
    const { agencyId, amount, newBalance, method, txId } = event.data

    /* Step 1 — Récupérer les infos agence.
     * Job Inngest déclenché en arrière-plan par le serveur (pas de session
     * Supabase à résoudre) — appelant système de confiance. */
    const [agency] = await withSystemContext((db) =>
      db
        .select({
          name: agencies.name,
          email: agencies.contactEmail,
        })
        .from(agencies)
        .where(eq(agencies.id, agencyId)),
    )

    if (!agency?.email) {
      return { success: false, reason: "no_agency_email" }
    }

    /* Step 2 — Envoyer l'email de confirmation rechargement */
    const resend = getResend()
    const { error } = await resend.emails.send({
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
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${resolveWalletCreditMethodLabel(method)}</td>
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

    if (error) {
      console.error("[process-wallet-credit] envoi email échoué", {
        agencyId,
        txId,
        error: error.message,
      })
      return { success: false, reason: "email_send_failed", agencyId, amount }
    }

    return { success: true, agencyId, amount }
  },
)
