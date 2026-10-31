/**
 * CRM-SOCIAL-CODE-FIX-01 — capture d'un email entrant (webhook Resend) en
 * lead CRM.
 *
 * Avant : `captureWebsiteLeadCore` était appelée telle quelle → provenance
 * enregistrée comme formulaire du site (`website` / `website_form`), et un
 * renvoi du même email (même `email_id`) créait un second lead et un second
 * email « nouveau lead ».
 *
 * Désormais :
 *  - provenance `email` / `email_inbound` ;
 *  - déduplication par `email_id` : verrou transactionnel sur
 *    (agence, email_id) puis recherche du lead `source_page =
 *    email_inbound:<email_id>` — un renvoi, même simultané, renvoie le lead
 *    existant (`alreadyProcessed: true`) sans rien écrire. Pas d'index unique
 *    (aucune migration dans ce chantier) : le verrou couvre la concurrence ;
 *  - sans `email_id` : un lead par appel (comportement antérieur) ;
 *  - aucun consentement écrit : écrire à l'agence n'est pas consentir au
 *    marketing.
 *
 * Pas de `server-only` : testé en live contre Postgres (app_runtime).
 */

import { and, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads } from "@/lib/db/schema"
import { captureWebsiteLeadCore } from "./website-lead-capture-core"

export const INBOUND_EMAIL_ORIGIN = {
  actorRef: "email",
  source: "email_inbound",
} as const

export function inboundEmailSourcePage(emailId: string | null): string {
  return emailId ? `email_inbound:${emailId}` : "email_inbound"
}

export async function captureInboundEmailLeadCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    firstName: string
    email: string
    message: string | null
    emailId: string | null
  },
): Promise<{ leadId: string; alreadyProcessed: boolean }> {
  const sourcePage = inboundEmailSourcePage(params.emailId)

  if (params.emailId) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`email_inbound:${params.agencyId}:${params.emailId}`}))`,
    )
    const [existing] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.agencyId, params.agencyId),
          eq(leads.sourcePage, sourcePage),
        ),
      )
      .limit(1)
    if (existing) return { leadId: existing.id, alreadyProcessed: true }
  }

  const captured = await captureWebsiteLeadCore(tx, {
    agencyId: params.agencyId,
    firstName: params.firstName,
    email: params.email,
    message: params.message,
    productType: "general",
    sourcePage,
    intention: "standard",
    origin: INBOUND_EMAIL_ORIGIN,
  })
  return { leadId: captured.leadId, alreadyProcessed: false }
}
