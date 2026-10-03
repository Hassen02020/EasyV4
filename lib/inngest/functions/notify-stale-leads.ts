/**
 * Inngest Function — notifyStaleLeads (CRM-RELANCE-CRON-01)
 *
 * Cron quotidien 08:00 UTC. Pour chaque agence ayant la relance activée,
 * envoie un récapitulatif email si des leads sont restés "new" plus de
 * `thresholdDays` jours sans qu'un staff les ait contactés.
 *
 * Idempotence : le step id inclut la date (YYYY-MM-DD) — les retries
 * Inngest du même run réutilisent le résultat mémoïsé, sans double envoi.
 *
 * Portée délibérément limitée à l'ALERTE STAFF — aucun message n'est
 * envoyé vers le lead lui-même (voir lead-relance-core.ts pour le contexte
 * produit).
 */

import { Resend } from "resend"
import { and, eq } from "drizzle-orm"
import { inngest } from "@/lib/inngest/client"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, leads, leadRelanceSettings } from "@/lib/db/schema"
import {
  isLeadStale,
  type LeadRelanceSettingsValue,
} from "@/lib/crm/lead-relance-core"
import type { LeadRow } from "@/lib/crm/leads-core"

function getResend() {
  if (!process.env.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY not configured")
  return new Resend(process.env.RESEND_API_KEY)
}

const SITE_URL = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://easy2book.tn"

function buildStaleLeadsHtml(params: {
  agencyName: string
  count: number
  thresholdDays: number
  staleLeads: LeadRow[]
  now: Date
  adminUrl: string
}): string {
  const { agencyName, count, thresholdDays, staleLeads, now, adminUrl } = params
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`

  const leadRows = staleLeads
    .slice(0, 10)
    .map((l) => {
      const name = [l.firstName, l.lastName].filter(Boolean).join(" ")
      const contact = l.email ?? l.phone ?? "—"
      const daysOld = Math.floor(
        (now.getTime() - new Date(l.updatedAt).getTime()) / 86_400_000,
      )
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${name}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${contact}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${plural(daysOld, "jour")}</td>
      </tr>`
    })
    .join("")

  const more =
    count > 10
      ? `<p style="color:#6b7280;font-size:13px;">… et ${count - 10} autre(s) lead(s).</p>`
      : ""

  return `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="color:#d97706;margin-bottom:4px;">⏰ Relance leads CRM</h2>
  <p style="color:#6b7280;margin-top:0;">Bonjour <strong>${agencyName}</strong>,</p>
  <p>
    <strong>${count}</strong> lead${count > 1 ? "s sont" : " est"} sans suivi depuis plus de
    <strong>${plural(thresholdDays, "jour")}</strong>.
  </p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:8px;text-align:left;color:#6b7280;font-size:12px;">Visiteur</th>
        <th style="padding:8px;text-align:left;color:#6b7280;font-size:12px;">Contact</th>
        <th style="padding:8px;text-align:left;color:#6b7280;font-size:12px;">En attente</th>
      </tr>
    </thead>
    <tbody>${leadRows}</tbody>
  </table>
  ${more}
  <a href="${adminUrl}"
     style="display:inline-block;background:#d97706;color:white;padding:10px 20px;
            text-decoration:none;border-radius:6px;font-weight:600;margin-top:8px;">
    Traiter les leads →
  </a>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="color:#9ca3af;font-size:12px;">
    Easy2Book — CRM Relance ·
    <a href="${adminUrl}" style="color:#9ca3af;">Configurer le seuil</a>
  </p>
</div>`
}

export const notifyStaleLeads = inngest.createFunction(
  {
    id: "notify-stale-leads",
    name: "CRM: notification leads sans suivi (cron quotidien)",
    retries: 2,
    triggers: { cron: "0 8 * * *" },
    onFailure: makeOnFailure("notify-stale-leads"),
  },
  async ({
    step,
  }: {
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD, step id stable pour idempotence

    return step.run(`notify-stale-${today}`, async () => {
      const now = new Date()
      const adminUrl = `${SITE_URL()}/admin/support`

      // 1. Agences avec relance activée
      const rows = await withSystemContext((tx) =>
        tx
          .select({
            agencyId: agencies.id,
            agencyName: agencies.name,
            agencyEmail: agencies.contactEmail,
            thresholdDays: leadRelanceSettings.thresholdDays,
            isEnabled: leadRelanceSettings.isEnabled,
          })
          .from(leadRelanceSettings)
          .innerJoin(agencies, eq(leadRelanceSettings.agencyId, agencies.id))
          .where(eq(leadRelanceSettings.isEnabled, true)),
      )

      if (rows.length === 0)
        return { skipped: true, reason: "no_agencies_with_relance_enabled" }

      const resend = getResend()
      const results: Array<{
        agencyId: string
        outcome: "sent" | "no_stale_leads" | "no_email" | "email_failed"
        count?: number
      }> = []

      for (const row of rows) {
        if (!row.agencyEmail) {
          results.push({ agencyId: row.agencyId, outcome: "no_email" })
          continue
        }

        const settings: LeadRelanceSettingsValue = {
          thresholdDays: row.thresholdDays,
          isEnabled: row.isEnabled,
        }

        // 2. Leads "new" de cette agence — withSystemContext car cron system (pas de session staff)
        const newLeads = await withSystemContext((tx) =>
          tx
            .select()
            .from(leads)
            .where(
              and(eq(leads.agencyId, row.agencyId), eq(leads.status, "new")),
            ),
        )

        const staleLeads = newLeads.filter((l) =>
          isLeadStale(l as LeadRow, settings, now),
        )

        if (staleLeads.length === 0) {
          results.push({ agencyId: row.agencyId, outcome: "no_stale_leads" })
          continue
        }

        // 3. Email récapitulatif
        const count = staleLeads.length
        const subject = `⏰ ${count} lead${count > 1 ? "s" : ""} sans suivi depuis plus de ${row.thresholdDays} jour${row.thresholdDays > 1 ? "s" : ""}`
        const html = buildStaleLeadsHtml({
          agencyName: row.agencyName,
          count,
          thresholdDays: row.thresholdDays,
          staleLeads: staleLeads as LeadRow[],
          now,
          adminUrl,
        })

        const { error } = await resend.emails.send({
          from: "Easy2Book <noreply@easy2book.tn>",
          to: row.agencyEmail,
          subject,
          html,
        })

        if (error) {
          console.error("[notify-stale-leads] email failed", {
            agencyId: row.agencyId,
            error: error.message,
          })
          results.push({
            agencyId: row.agencyId,
            outcome: "email_failed",
            count,
          })
        } else {
          results.push({ agencyId: row.agencyId, outcome: "sent", count })
        }
      }

      return { today, results }
    })
  },
)
