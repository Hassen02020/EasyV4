/**
 * CrmProvider — abstraction pour la synchronisation CRM.
 *
 * Branche "CRM" du diagramme cible EASY2BOOK (Event/Retry Engine → Email /
 * WhatsApp / CRM). Contrairement à WhatsApp (lib/whatsapp/provider.ts, API
 * Meta publique et stable), aucun système CRM cible n'a été choisi et
 * aucun credential n'existe dans ce repo — brancher un adaptateur
 * HubSpot/Salesforce/Zoho/autre ici serait deviner un contrat d'API et un
 * modèle de données non vérifiés pour ce projet, exactement ce que ce
 * projet s'interdit (voir la même règle déjà appliquée à
 * lib/payment/provider.ts pour SPS).
 *
 * Cette abstraction n'est donc QUE le contrat + le provider honnête par
 * défaut, câblé dans le Event/Retry Engine (voir
 * lib/inngest/functions/sync-booking-crm.ts) pour que le point d'entrée
 * existe déjà — brancher un vrai adaptateur plus tard consiste à
 * implémenter `CrmProvider` et à le sélectionner dans `getCrmProvider()`,
 * sans toucher au reste du pipeline. Comportement honnête tant qu'aucun
 * adaptateur réel n'est branché : `CRM_PROVIDER_NOT_CONFIGURED` — jamais
 * une fausse synchronisation.
 */

export type CrmProviderCode = "CRM_PROVIDER_NOT_CONFIGURED" | "CRM_SYNC_FAILED"

export interface SyncBookingInput {
  reservationId: string
  publicRef: string
  agencyId: string
  customerEmail: string
  customerName: string
  customerPhone: string
  totalTnd: number
  /** Date de confirmation, ISO 8601. */
  confirmedAt: string
}

export interface CrmSyncResult {
  ok: boolean
  code?: CrmProviderCode
  message?: string
  /** Identifiant du contact/deal côté CRM. Absent si `ok: false`. */
  providerRecordId?: string
}

/**
 * Contrat minimal qu'un fournisseur CRM doit implémenter. Aucune méthode
 * ne doit jamais retourner `ok: true` sans confirmation réelle du
 * provider — pas de simulation locale.
 */
export interface CrmProvider {
  readonly name: string
  readonly configured: boolean
  syncBooking(input: SyncBookingInput): Promise<CrmSyncResult>
}

/**
 * Provider honnête par défaut — utilisé tant qu'aucun système CRM réel
 * n'est choisi/configuré. Ne fabrique jamais de synchronisation.
 */
class NotConfiguredCrmProvider implements CrmProvider {
  readonly name = "not_configured"
  readonly configured = false

  async syncBooking(): Promise<CrmSyncResult> {
    return {
      ok: false,
      code: "CRM_PROVIDER_NOT_CONFIGURED",
      message: "Aucun système CRM configuré pour ce projet.",
    }
  }
}

/**
 * Résout si un fournisseur CRM réel semble configuré. Renvoie toujours
 * `false` aujourd'hui — aucun système CRM n'a été choisi pour ce projet.
 * Prévu pour évoluer le jour où un adaptateur réel est branché (ex.
 * `Boolean(process.env.HUBSPOT_API_KEY)`), sans toucher aux appelants.
 */
export function hasConfiguredCrmProvider(): boolean {
  return false
}

/**
 * Point d'entrée unique. Retourne toujours un `CrmProvider` valide — le
 * provider "non configuré" honnête tant qu'aucun adaptateur réel n'est
 * branché ici.
 */
export function getCrmProvider(): CrmProvider {
  return new NotConfiguredCrmProvider()
}
