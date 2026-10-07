/**
 * META-LEADADS-WEBHOOK-01 — capture d'un lead Meta Lead Ads, même patron
 * que lib/crm/inbox-core.ts::upsertConversationForInboundCore (WhatsApp) :
 * createLeadCore → recordLeadOriginEventCore → resolveOrCreateContactCore,
 * aucune nouvelle méthode de résolution inventée ici.
 *
 * Différences factuelles avec WhatsApp (jamais gommées) :
 *  - idempotence par `leadgenId` (Meta peut redélivrer le même événement
 *    `leadgen`) — pas de table crm_messages ici, donc pas de contrainte
 *    unique dédiée (zéro migration) : vérifié par requête avant insertion,
 *    sur `leads.sourcePage = "meta_leadads:<leadgenId>"`, valeur stable et
 *    inspectable.
 *  - CONSENT : AUCUN événement n'est jamais écrit dans lead_consent_events
 *    ici. Le disclaimer de consentement affiché par Meta sur le formulaire
 *    publicitaire n'est PAS automatiquement un consentement marketing
 *    Easy2Book (règle posée dans l'audit SOCIAL-CRM-01, docs/ROADMAP.md) —
 *    tant qu'aucune validation juridique explicite n'a confirmé le texte
 *    du disclaimer, ce lead reste "signal commercial sans consentement",
 *    exactement comme n'importe quel lead sans événement de consentement
 *    (filterAudienceByConsentCore, lib/crm/campaign-core.ts, l'exclura
 *    déjà correctement de toute campagne — aucun cas spécial à coder).
 */

import { and, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads } from "@/lib/db/schema"
import { createLeadCore } from "@/lib/crm/leads-core"
import { recordLeadOriginEventCore } from "@/lib/crm/network-demand-capture-core"
import { resolveOrCreateContactCore } from "@/lib/crm/contact-core"
import type { MetaLeadFieldData } from "./provider"

const EMAIL_FIELD_NAMES = ["email"]
const PHONE_FIELD_NAMES = ["phone_number", "phone"]
const NAME_FIELD_NAMES = ["full_name", "first_name"]
const DESTINATION_FIELD_NAMES = ["destination"]

function firstMatchingField(
  fields: Record<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const value = fields[candidate]
    if (value && value.trim().length > 0) return value.trim()
  }
  return null
}

export interface MetaLeadCaptureResult {
  leadId: string
  /** `null` : ni email ni téléphone dans field_data — aucun contact résolu, jamais un contact fabriqué. */
  contactId: string | null
  /** `true` si ce leadgenId avait déjà été traité (redélivrance Meta) — aucune ligne dupliquée créée. */
  alreadyProcessed: boolean
}

export async function captureMetaLeadCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; data: MetaLeadFieldData },
): Promise<MetaLeadCaptureResult> {
  const sourcePage = `meta_leadads:${params.data.leadgenId}`

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

  if (existing) {
    return { leadId: existing.id, contactId: null, alreadyProcessed: true }
  }

  const email = firstMatchingField(params.data.fields, EMAIL_FIELD_NAMES)
  const phone = firstMatchingField(params.data.fields, PHONE_FIELD_NAMES)
  const name = firstMatchingField(params.data.fields, NAME_FIELD_NAMES)
  const destination = firstMatchingField(
    params.data.fields,
    DESTINATION_FIELD_NAMES,
  )

  const created = await createLeadCore(tx, {
    agencyId: params.agencyId,
    firstName: name || "Lead Meta Ads",
    email,
    phone,
    productType: "general",
    sourcePage,
    destination,
  })

  await recordLeadOriginEventCore(tx, {
    agencyId: params.agencyId,
    leadId: created.id,
    role: "channel",
    actorRef: "meta_leadads",
    source: "meta_leadads_webhook",
    // Signature HMAC déjà vérifiée avant l'appel à cette fonction (voir
    // app/api/webhooks/meta-leadads/route.ts) — même raisonnement que le
    // webhook WhatsApp (inbox-core.ts).
    authorized: true,
  })

  let contactId: string | null = null
  if (email) {
    const contact = await resolveOrCreateContactCore(tx, {
      agencyId: params.agencyId,
      channel: "email",
      rawRef: email,
    })
    contactId = contact.id
  } else if (phone) {
    const contact = await resolveOrCreateContactCore(tx, {
      agencyId: params.agencyId,
      channel: "call",
      rawRef: phone,
    })
    contactId = contact.id
  }

  return { leadId: created.id, contactId, alreadyProcessed: false }
}
