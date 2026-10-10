/**
 * CRM-LEAD-WIRING-01 — capture d'un lead soumis via le formulaire public du
 * site (app/actions/submit-lead.ts), même patron que
 * lib/meta-leadads/lead-capture-core.ts::captureMetaLeadCore :
 * createLeadCore → recordLeadOriginEventCore → resolveOrCreateContactCore,
 * aucune nouvelle méthode de résolution inventée ici.
 *
 * CONSENT : AUCUN événement n'est jamais écrit dans lead_consent_events
 * ici — components/leads/lead-capture-form.tsx n'affiche aucune case de
 * consentement marketing. Fabriquer un consentement implicite serait une
 * donnée inventée (interdit par CONSENT-01). Ce lead reste "signal
 * commercial sans consentement", exclu de toute campagne par
 * filterAudienceByConsentCore (lib/crm/campaign-core.ts) — aucun cas
 * spécial à coder ici, même raisonnement que META-LEADADS-WEBHOOK-01.
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import {
  createLeadCore,
  type LeadIntention,
  type LeadProductType,
} from "./leads-core"
import { recordLeadOriginEventCore } from "./network-demand-capture-core"
import { resolveOrCreateContactCore } from "./contact-core"

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
}

export interface WebsiteLeadCaptureResult {
  leadId: string
  /** `null` : ni email ni téléphone fournis — aucun contact fabriqué. */
  contactId: string | null
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

  return { leadId: created.id, contactId }
}
