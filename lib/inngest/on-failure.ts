/**
 * Handler `onFailure` partagé pour les fonctions Inngest — Phase 20
 * (observabilité serveur). Inngest appelle `onFailure` UNE FOIS, après
 * épuisement de tous les retries — c'est le signal "cette notification/
 * ce traitement asynchrone a définitivement échoué" qui doit remonter à
 * l'observabilité (Sentry), en plus du dashboard Inngest lui-même.
 *
 * Ne fait qu'observer : n'écrit JAMAIS dans reservations/payments/wallet —
 * ces fonctions (WhatsApp/CRM/voucher/wallet-credit) sont déjà isolées de
 * l'état réservation/paiement par construction (voir leurs modules
 * lib/whatsapp/*, lib/crm/*). `captureError` est elle-même no-op sans
 * SENTRY_DSN et ne lève jamais.
 */

import { captureError } from "@/lib/observability/capture-error"

interface InngestFailureArgs {
  error: unknown
  event?: { data?: Record<string, unknown> } | null
}

/** `functionId` sert de tag `operation` côté Sentry pour distinguer les 6 fonctions. */
export function makeOnFailure(functionId: string) {
  return async ({ error, event }: InngestFailureArgs) => {
    const data = event?.data ?? {}
    captureError(error, {
      operation: `inngest:${functionId}`,
      reservationId: typeof data.reservationId === "string" ? data.reservationId : undefined,
      agencyId: typeof data.agencyId === "string" ? data.agencyId : undefined,
    })
  }
}
