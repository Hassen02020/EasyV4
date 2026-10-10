/**
 * CRM-STAFF-LEAD-01 — saisie manuelle d'un lead par le staff, pour les
 * canaux offline (appel entrant, présentiel, partenaire, etc.) qui n'ont
 * pas de webhook automatique.
 *
 * Même patron que captureWebsiteLeadCore / captureMetaLeadCore :
 *   createLeadCore → recordLeadOriginEventCore (role=channel) →
 *   recordLeadOriginEventCore (role=captured_by_user) →
 *   resolveOrCreateContactCore (si email ou téléphone fourni).
 *
 * `source: "staff_manual_entry"` rang 2 dans LEAD_ORIGIN_SOURCE_TRUST — plus
 * haut que tout webhook automatique (rang 1) et toute déclaration UTM/partner
 * (rang 0), mais en dessous de `staff_correction` (rang 3) qui est réservé
 * aux corrections d'un enregistrement existant.
 *
 * PAS un fichier "use server" — même convention que les autres *-core.ts.
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import { createLeadCore, type LeadProductType } from "./leads-core"
import { recordLeadOriginEventCore } from "./network-demand-capture-core"
import { resolveOrCreateContactCore } from "./contact-core"
import type { CrmChannel } from "./inbox-core"

export interface StaffLeadCaptureParams {
  agencyId: string
  /** UUID de l'agent qui saisit — JAMAIS fourni par le client, toujours
   *  résolu depuis la session serveur par l'appelant (leads-actions.ts). */
  capturedByUserId: string
  firstName: string
  lastName?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  /** Canal de provenance déclaré par l'agent (appel, email, etc.). */
  channel: CrmChannel
  productType?: LeadProductType
}

export interface StaffLeadCaptureResult {
  leadId: string
  /** null si ni email ni téléphone fournis — aucun contact fabriqué. */
  contactId: string | null
}

export async function captureStaffLeadCore(
  tx: DrizzleTransaction,
  params: StaffLeadCaptureParams,
): Promise<StaffLeadCaptureResult> {
  const created = await createLeadCore(tx, {
    agencyId: params.agencyId,
    firstName: params.firstName,
    lastName: params.lastName ?? null,
    email: params.email ?? null,
    phone: params.phone ?? null,
    message: params.notes ?? null,
    productType: params.productType ?? "general",
    sourcePage: "staff",
  })

  await recordLeadOriginEventCore(tx, {
    agencyId: params.agencyId,
    leadId: created.id,
    role: "channel",
    actorRef: params.channel,
    source: "staff_manual_entry",
    authorized: true,
  })

  await recordLeadOriginEventCore(tx, {
    agencyId: params.agencyId,
    leadId: created.id,
    role: "captured_by_user",
    actorRef: params.capturedByUserId,
    source: "staff_manual_entry",
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
      channel: params.channel === "whatsapp" ? "whatsapp" : "call",
      rawRef: params.phone,
    })
    contactId = contact.id
  }

  return { leadId: created.id, contactId }
}
