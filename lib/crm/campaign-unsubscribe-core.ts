/**
 * CRM-CAMPAIGN-SAFETY-01 — désinscription depuis un email de campagne
 * (écarts G-08 et G-10 de docs/crm/CRM_CARTOGRAPHY.md).
 *
 * Le lien de chaque email porte l'identifiant de la cible de campagne
 * (`campaign_targets.id`, UUID aléatoire non devinable) : aucun nouveau
 * secret, et aucune donnée personnelle dans l'URL.
 *
 * Effet : un évènement de consentement `withdrawn` (append-only,
 * `lead_consent_events`) pour le contact et le canal de la cible. La
 * vérification de consentement déjà faite avant chaque envoi bloque ensuite
 * toute nouvelle campagne vers ce contact. Idempotent : si le consentement est
 * déjà retiré, rien n'est réécrit.
 *
 * Appelé sans session (page publique, POST « un clic » du client mail) : le
 * contexte système est nécessaire pour retrouver la cible ; l'agence, le
 * canal et le contact sont ensuite lus en base, jamais fournis par la requête.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { campaignTargets, contacts } from "@/lib/db/schema"
import {
  hasMarketingConsentCore,
  recordConsentEventCore,
} from "@/lib/crm/consent-core"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CAMPAIGN_UNSUBSCRIBE_SOURCE = "campaign_unsubscribe"

export type UnsubscribeResult =
  | { ok: true; alreadyUnsubscribed: boolean }
  | { ok: false; code: "NOT_FOUND" }

export async function unsubscribeCampaignTargetCore(
  tx: DrizzleTransaction,
  targetId: string,
): Promise<UnsubscribeResult> {
  if (!UUID_RE.test(targetId)) return { ok: false, code: "NOT_FOUND" }

  const [row] = await tx
    .select({
      agencyId: campaignTargets.agencyId,
      channel: contacts.channel,
      contactRef: contacts.contactRef,
    })
    .from(campaignTargets)
    .innerJoin(contacts, eq(contacts.id, campaignTargets.contactId))
    .where(eq(campaignTargets.id, targetId))
    .limit(1)

  if (!row) return { ok: false, code: "NOT_FOUND" }

  const stillConsents = await hasMarketingConsentCore(tx, {
    agencyId: row.agencyId,
    channel: row.channel,
    contactRef: row.contactRef,
  })
  if (!stillConsents) return { ok: true, alreadyUnsubscribed: true }

  const recorded = await recordConsentEventCore(tx, {
    agencyId: row.agencyId,
    channel: row.channel,
    contactRef: row.contactRef,
    purpose: "marketing",
    action: "withdrawn",
    source: CAMPAIGN_UNSUBSCRIBE_SOURCE,
    proofRef: `campaign_target:${targetId}`,
  })
  if (!recorded.ok) return { ok: false, code: "NOT_FOUND" }
  return { ok: true, alreadyUnsubscribed: false }
}
