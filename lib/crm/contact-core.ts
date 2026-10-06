/**
 * CONTACT-01 — registre de POINTS DE CONTACT normalisés. Répond à UNE
 * seule question — "cette valeur de contact a-t-elle déjà un id
 * stable ?" — jamais "qui est cette personne ?".
 *
 * Audit de conception dédié (docs/ROADMAP.md) : `customers` a été
 * explicitement exclu comme fondation (pas d'index unique email/phone,
 * et lib/admin/customer-360-core.ts documente déjà qu'un même lead peut
 * correspondre à plusieurs customerId sans jamais être fusionné). Ce
 * module ne fusionne JAMAIS deux points de contact entre eux, et ne
 * relie jamais un contact à un lead/customer/person — il n'expose que
 * `resolveOrCreateContactCore`, qui renvoie un id stable pour
 * (agencyId, channel, contactRef).
 *
 * PAS un fichier `"use server"` (même convention que consent-core.ts).
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import { contacts, type CrmChannel } from "@/lib/db/schema"

export { CRM_CHANNELS } from "@/lib/db/schema"
export type { CrmChannel }

/**
 * Normalisation email — dupliquée volontairement de
 * lib/crm/consent-core.ts::normalizeContactRef plutôt qu'importée :
 * CONTACT-01 n'a AUCUNE dépendance vers CONSENT-01 (chantiers audités
 * et implémentés séparément, sur des branches indépendantes). Même
 * règle simple des deux côtés : minuscules + trim pour un email,
 * téléphone laissé à la normalisation dédiée ci-dessous.
 */
function normalizeEmailRefCore(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed
}

/**
 * Normalisation téléphone — scope VOLONTAIREMENT limité au marché actif
 * (LEAD_MARKETS = ["tunisia"], lib/crm/leads-core.ts). Reconnaît
 * +216/00216/8 chiffres locaux → forme canonique +216XXXXXXXX. Tout
 * numéro hors de ce format est renvoyé tel quel (espaces/tirets/
 * parenthèses retirés) — JAMAIS une valeur fabriquée, jamais une
 * prétention de normalisation E.164 internationale complète.
 */
export function normalizePhoneRefCore(raw: string): string {
  const stripped = raw.trim().replace(/[\s\-().]/g, "")
  const digitsOnly = stripped.replace(/^\+/, "")

  if (/^216\d{8}$/.test(digitsOnly)) {
    return `+216${digitsOnly.slice(3)}`
  }
  if (/^00216\d{8}$/.test(digitsOnly)) {
    return `+216${digitsOnly.slice(5)}`
  }
  if (/^\d{8}$/.test(digitsOnly)) {
    return `+216${digitsOnly}`
  }
  return stripped
}

/**
 * Normalisation partagée par canal — email (consent-core.ts) pour
 * "email", téléphone (ci-dessus) pour les canaux à numéro
 * (whatsapp/call), inchangé pour les autres (instagram/messenger/web —
 * pas de format de référence connu).
 */
export function resolveContactKeyCore(
  channel: CrmChannel,
  rawRef: string,
): string {
  if (channel === "email") return normalizeEmailRefCore(rawRef)
  if (channel === "whatsapp" || channel === "call") {
    return normalizePhoneRefCore(rawRef)
  }
  return rawRef.trim()
}

export interface ContactRow {
  id: string
  agencyId: string
  channel: CrmChannel
  contactRef: string
  firstSeenAt: Date
  lastSeenAt: Date
}

/**
 * Find-or-create idempotent. Un appel répété avec la même
 * (agencyId, channel, rawRef) renvoie TOUJOURS le même id — seul
 * `lastSeenAt` avance. Ne crée jamais de lien vers un lead/customer :
 * l'appelant reste responsable de tout rapprochement, ce module ne
 * fait que reconnaître la valeur de contact elle-même.
 */
export async function resolveOrCreateContactCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; channel: CrmChannel; rawRef: string },
): Promise<ContactRow> {
  const contactRef = resolveContactKeyCore(params.channel, params.rawRef)
  const now = new Date()

  const [row] = await tx
    .insert(contacts)
    .values({
      agencyId: params.agencyId,
      channel: params.channel,
      contactRef,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [contacts.agencyId, contacts.channel, contacts.contactRef],
      set: { lastSeenAt: now, updatedAt: now },
    })
    .returning()

  return { ...row!, channel: row!.channel as CrmChannel }
}
