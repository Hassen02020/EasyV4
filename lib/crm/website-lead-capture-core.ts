/**
 * CRM-LEAD-WIRING-01 — capture d'un lead soumis via le formulaire public du
 * site (app/actions/submit-lead.ts), même patron que
 * lib/meta-leadads/lead-capture-core.ts::captureMetaLeadCore :
 * createLeadCore → recordLeadOriginEventCore → resolveOrCreateContactCore,
 * aucune nouvelle méthode de résolution inventée ici.
 *
 * CONSENT (CRM-LEAD-FLOW-01) : un consentement marketing n'est enregistré
 * QUE si le visiteur a coché la case explicite du formulaire
 * (`marketingConsent: true`, jamais cochée par défaut). Sans cette case, AUCUN
 * événement n'est écrit — fabriquer un consentement implicite serait une
 * donnée inventée (interdit par CONSENT-01) — et le lead reste exclu de toute
 * campagne par filterAudienceByConsentCore (lib/crm/campaign-core.ts).
 *
 * Avec la case cochée, le consentement est enregistré pour CHAQUE canal
 * réellement fourni : `email` pour l'adresse, `whatsapp` et `call` pour le
 * téléphone. Il est rattaché au `contactRef` NORMALISÉ du contact de ce canal
 * (resolveOrCreateContactCore), exactement la clé que le filtre de campagne
 * consulte — sinon le consentement existerait sans jamais rendre le contact
 * éligible. Preuve : `proofRef = lead:<id>`, source `website_form`.
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import {
  createLeadCore,
  type LeadIntention,
  type LeadProductType,
} from "./leads-core"
import { recordLeadOriginEventCore } from "./network-demand-capture-core"
import { resolveOrCreateContactCore } from "./contact-core"
import { recordConsentEventCore } from "./consent-core"

export interface WebsiteLeadCaptureParams {
  agencyId: string
  firstName: string
  lastName?: string | null
  email?: string | null
  phone?: string | null
  message?: string | null
  productType: LeadProductType
  productRef?: string | null
  productLabel?: string | null
  sourcePage: string
  destination?: string | null
  intention: LeadIntention
  /** UTM-CAPTURE-01 — valeur de ?campaign= ou ?utm_campaign= depuis l'URL d'atterrissage. Donnée analytique non fiable (fournie par le visiteur), jamais utilisée dans un calcul financier. */
  campaignRef?: string | null
  /** CRM-LEAD-FLOW-01 — case de consentement marketing cochée explicitement. */
  marketingConsent?: boolean
}

export interface WebsiteLeadCaptureResult {
  leadId: string
  /** `null` : ni email ni téléphone fournis — aucun contact fabriqué. */
  contactId: string | null
  /** Événements de consentement écrits (vide sans case cochée). */
  consentEventIds: string[]
}

export async function captureWebsiteLeadCore(
  tx: DrizzleTransaction,
  params: WebsiteLeadCaptureParams,
): Promise<WebsiteLeadCaptureResult> {
  const created = await createLeadCore(tx, {
    agencyId: params.agencyId,
    firstName: params.firstName,
    lastName: params.lastName ?? null,
    email: params.email ?? null,
    phone: params.phone ?? null,
    message: params.message ?? null,
    productType: params.productType,
    productRef: params.productRef ?? null,
    productLabel: params.productLabel ?? null,
    sourcePage: params.sourcePage,
    destination: params.destination ?? null,
    intention: params.intention,
    campaignRef: params.campaignRef ?? null,
  })

  await recordLeadOriginEventCore(tx, {
    agencyId: params.agencyId,
    leadId: created.id,
    role: "channel",
    actorRef: "website",
    source: "website_form",
    authorized: true,
  })

  let contactId: string | null = null
  if (params.email) {
    const contact = await resolveOrCreateContactCore(tx, {
      agencyId: params.agencyId,
      channel: "email",
      rawRef: params.email,
    })
    contactId = contact.id
  } else if (params.phone) {
    const contact = await resolveOrCreateContactCore(tx, {
      agencyId: params.agencyId,
      channel: "call",
      rawRef: params.phone,
    })
    contactId = contact.id
  }

  const consentEventIds: string[] = []
  if (params.marketingConsent === true) {
    const channels: Array<{
      channel: "email" | "whatsapp" | "call"
      raw: string
    }> = [
      ...(params.email
        ? [{ channel: "email" as const, raw: params.email }]
        : []),
      ...(params.phone
        ? [
            { channel: "whatsapp" as const, raw: params.phone },
            { channel: "call" as const, raw: params.phone },
          ]
        : []),
    ]
    for (const { channel, raw } of channels) {
      const contact = await resolveOrCreateContactCore(tx, {
        agencyId: params.agencyId,
        channel,
        rawRef: raw,
      })
      const recorded = await recordConsentEventCore(tx, {
        agencyId: params.agencyId,
        channel,
        contactRef: contact.contactRef,
        purpose: "marketing",
        action: "granted",
        source: "website_form",
        proofRef: `lead:${created.id}`,
      })
      if (!recorded.ok) {
        // Canal/finalité/action sont des constantes valides : une erreur ici
        // est un défaut de code — annuler la transaction plutôt que perdre la
        // preuve du consentement en silence.
        throw new Error(`CONSENT_RECORD_FAILED:${recorded.code}`)
      }
      consentEventIds.push(recorded.eventId)
    }
  }

  return { leadId: created.id, contactId, consentEventIds }
}
