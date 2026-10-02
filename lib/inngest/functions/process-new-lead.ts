/**
 * Inngest Function — processNewLead
 *
 * Déclenchée par l'événement "crm/lead.created".
 * Envoie un email de notification à l'agence (agencies.contact_email)
 * dès qu'un visiteur soumet le formulaire "Être rappelé" / "Demander un devis".
 *
 * Pas d'idempotence : un lead = un email, retries Inngest acceptables
 * (l'agent reçoit au pire deux notifications identiques, sans risque financier).
 */

import { Resend } from "resend"
import { eq } from "drizzle-orm"
import { inngest, type Events } from "../client"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité / attraction",
  general: "Renseignement général",
}

function resolveProductLabel(
  productType: string,
  productLabel: string | null,
): string {
  const typeLabel = PRODUCT_TYPE_LABEL[productType] ?? productType
  return productLabel ? `${typeLabel} — ${productLabel}` : typeLabel
}

export const processNewLead = inngest.createFunction(
  {
    id: "process-new-lead",
    name: "Process New Lead — Notify Agency",
    retries: 3,
    triggers: { event: "crm/lead.created" },
    onFailure: makeOnFailure("process-new-lead"),
  },
  async ({
    event,
  }: {
    event: { data: Events["crm/lead.created"]["data"] }
  }) => {
    const {
      leadId,
      agencyId,
      firstName,
      lastName,
      email,
      phone,
      message,
      productType,
      productLabel,
      sourcePage,
    } = event.data

    const [agency] = await withSystemContext((db) =>
      db
        .select({ name: agencies.name, email: agencies.contactEmail })
        .from(agencies)
        .where(eq(agencies.id, agencyId)),
    )

    if (!agency?.email) {
      return { success: false, reason: "no_agency_email", agencyId, leadId }
    }

    const visitorName = [firstName, lastName].filter(Boolean).join(" ")
    const subject = `📥 Nouveau lead — ${visitorName}`
    const product = resolveProductLabel(productType, productLabel)

    const contactLine = [
      email ? `Email : <a href="mailto:${email}">${email}</a>` : null,
      phone ? `Tél : ${phone}` : null,
    ]
      .filter(Boolean)
      .join(" &nbsp;·&nbsp; ")

    const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://easy2book.tn"}/admin/support`

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #7c3aed; margin-bottom: 4px;">📥 Nouveau lead CRM</h2>
        <p style="color: #6b7280; margin-top: 0;">Bonjour <strong>${agency.name}</strong>,</p>
        <p>Un visiteur vient de remplir le formulaire de contact sur votre site.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280; white-space: nowrap;">Visiteur</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${visitorName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Contact</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${contactLine || "—"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Intérêt</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${product}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Page source</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">${sourcePage}</td>
          </tr>
          ${
            message
              ? `<tr>
            <td style="padding: 8px; color: #6b7280; vertical-align: top;">Message</td>
            <td style="padding: 8px; font-style: italic;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
          </tr>`
              : ""
          }
        </table>

        <a href="${adminUrl}"
           style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px;
                  text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 8px;">
          Voir les leads → Admin
        </a>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">Easy2Book — CRM &amp; Leads</p>
      </div>
    `

    const resend = getResend()
    const { error } = await resend.emails.send({
      from: "Easy2Book <noreply@easy2book.tn>",
      to: agency.email,
      subject,
      html,
    })

    if (error) {
      console.error("[process-new-lead] envoi email échoué", {
        agencyId,
        leadId,
        error: error.message,
      })
      return { success: false, reason: "email_send_failed", agencyId, leadId }
    }

    return { success: true, agencyId, leadId }
  },
)
