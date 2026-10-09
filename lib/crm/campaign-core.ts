/**
 * CAMPAIGN-01 — point d'entrée UNIQUE pour la question "quels CONTACTS
 * d'une audience ont le droit de recevoir une action commerciale ?".
 *
 * Flux imposé par l'audit de conception (docs/ROADMAP.md) :
 *
 *   AUDIENCE → LEADs → CONTACTs uniques (CONTACT-01) → CONSENT (CONSENT-01)
 *     → CONTACTs éligibles → CAMPAIGN
 *
 * CAMPAIGN n'implémente AUCUNE logique propre de déduplication ni
 * d'éligibilité — il orchestre deux appels, dans cet ordre, jamais
 * l'inverse :
 *   1. `resolveOrCreateContactCore` (lib/crm/contact-core.ts) — UNIQUEMENT
 *      pour regrouper les LEADs en CONTACTs uniques. Ne décide jamais
 *      d'éligibilité.
 *   2. `hasMarketingConsentCore` (lib/crm/consent-core.ts) — appelé UNE
 *      SEULE FOIS par CONTACT unique (jamais par LEAD), pour déterminer
 *      l'éligibilité.
 *
 * Ce module ne touche jamais `lead_consent_events` en écriture, et ne
 * fusionne jamais deux CONTACTs entre eux au-delà de ce que CONTACT-01
 * résout déjà lui-même.
 *
 * HORS SCOPE strict : envoi réel, persistance d'une entité "Campaign",
 * ciblage/segmentation (déjà couvert par NICHE/AUDIENCE), scoring.
 *
 * Mapping canal → champ brut sur LeadRow : un `LeadRow` n'a pas de
 * `contactRef` générique, seulement `email`/`phone`. Pour les canaux
 * sans équivalent stocké (instagram/messenger/web), aucune valeur n'est
 * fabriquée — ces leads sont exclus explicitement (`NO_CONTACT_REF`),
 * jamais passés à CONTACT-01 avec une valeur inventée.
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import type { CrmChannel } from "@/lib/db/schema"
import { hasMarketingConsentCore } from "./consent-core"
import { resolveOrCreateContactCore } from "./contact-core"
import type { LeadRow } from "./leads-core"

/**
 * Canal de contact marketing → champ source brut sur LeadRow. `null` =
 * aucun champ équivalent stocké aujourd'hui pour ce canal. La valeur
 * retournée n'est PAS normalisée ici — CONTACT-01 (resolveOrCreateContactCore)
 * est seul responsable de la normalisation, jamais dupliquée ici.
 */
export function resolveContactRefForChannelCore(
  lead: Pick<LeadRow, "email" | "phone">,
  channel: CrmChannel,
): string | null {
  switch (channel) {
    case "email":
      return lead.email ?? null
    case "whatsapp":
    case "call":
      return lead.phone ?? null
    case "instagram":
    case "messenger":
    case "web":
      return null
  }
}

export interface CampaignEligibleContact {
  contactId: string
  contactRef: string
  leadIds: string[]
  eligible: boolean
}

export interface ExcludedLead {
  leadId: string
  reason: "NO_CONTACT_REF"
}

export interface FilterAudienceByConsentResult {
  contacts: CampaignEligibleContact[]
  excludedLeads: ExcludedLead[]
}

/**
 * AUDIENCE (déjà constituée par NICHE/AUDIENCE, jamais recalculée ici)
 * → CONTACTs uniques (CONTACT-01) → éligibilité (CONSENT-01).
 *
 * Plusieurs LEADs partageant le même point de contact (même après
 * normalisation — ex. deux écritures différentes du même numéro)
 * résolvent au MÊME `contactId` et n'apparaissent qu'UNE fois dans
 * `contacts[]`, avec `leadIds` listant toutes les demandes d'origine —
 * jamais fusionnées en une identité "personne", seulement regroupées
 * par point de contact.
 */
export async function filterAudienceByConsentCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    audience: Pick<LeadRow, "id" | "email" | "phone">[]
    channel: CrmChannel
  },
): Promise<FilterAudienceByConsentResult> {
  const excludedLeads: ExcludedLead[] = []

  // AUDIENCE-DEDUP-01 : pré-grouper les leads par rawRef avant de résoudre
  // les contacts — évite d'appeler resolveOrCreateContactCore N fois pour
  // le même ref (O(N leads) → O(N refs uniques)).
  const leadIdsByRef = new Map<string, string[]>()
  for (const lead of params.audience) {
    const rawRef = resolveContactRefForChannelCore(lead, params.channel)
    if (rawRef === null) {
      excludedLeads.push({ leadId: lead.id, reason: "NO_CONTACT_REF" })
      continue
    }
    const list = leadIdsByRef.get(rawRef) ?? []
    list.push(lead.id)
    leadIdsByRef.set(rawRef, list)
  }

  const entriesByContactId = new Map<
    string,
    { contactId: string; contactRef: string; leadIds: string[] }
  >()

  for (const [rawRef, leadIds] of leadIdsByRef) {
    const contact = await resolveOrCreateContactCore(tx, {
      agencyId: params.agencyId,
      channel: params.channel,
      rawRef,
    })

    const existing = entriesByContactId.get(contact.id)
    if (existing) {
      existing.leadIds.push(...leadIds)
    } else {
      entriesByContactId.set(contact.id, {
        contactId: contact.id,
        contactRef: contact.contactRef,
        leadIds: [...leadIds],
      })
    }
  }

  const contactResults: CampaignEligibleContact[] = []
  for (const entry of entriesByContactId.values()) {
    const eligible = await hasMarketingConsentCore(tx, {
      agencyId: params.agencyId,
      channel: params.channel,
      contactRef: entry.contactRef,
    })
    contactResults.push({ ...entry, eligible })
  }

  return { contacts: contactResults, excludedLeads }
}
