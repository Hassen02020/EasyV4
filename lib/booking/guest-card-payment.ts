/**
 * Tentative de paiement carte B2C + compensation myGo — logique isolée et
 * testable, extraite de `guest-actions.ts` (même raison que
 * `lib/admin/reservation-status.ts`/`lib/finance/manual-payment-logic.ts` :
 * un module pur, hors "use server", pour rester testable sans DB ni myGo
 * réel).
 *
 * Défaut réel corrigé — Phase 15 : `provider.createPayment()` n'était
 * appelé nulle part sous try/catch dans `guest-actions.ts` — seul le cas
 * `ok: false` déclenchait l'annulation myGo (compensation). Si le provider
 * LÈVE une exception au lieu de renvoyer proprement `{ ok: false }` (cas
 * réel dès qu'un vrai PSP réseau est branché : timeout, erreur DNS, 5xx mal
 * géré côté SDK...), aucune compensation myGo n'avait jamais lieu — la
 * réservation fournisseur restait confirmée côté myGo sans qu'aucune trace
 * locale n'existe, et l'exception remontait non gérée hors de
 * `createGuestReservationFromDraft`. Aujourd'hui dormant (le seul provider
 * qui existe, `NotConfiguredPaymentProvider`, ne lève jamais — voir
 * lib/payment/provider.ts) mais un défaut réel dès qu'un adaptateur PSP
 * réel sera branché — corrigé préventivement, pas fabriqué.
 */

import type { CreatePaymentInput, PaymentProvider, PaymentResult } from "@/lib/payment/provider"

/**
 * Tente un paiement carte. Que le provider renvoie `{ok:false}` OU lève une
 * exception, le résultat est le même : la réservation fournisseur
 * (`compensate`) est annulée en best-effort (jamais bloquant — un échec de
 * compensation ne doit jamais masquer l'échec du paiement lui-même), et un
 * `PaymentResult` propre est toujours renvoyé — jamais d'exception qui
 * s'échappe vers l'appelant.
 */
export async function attemptCardPayment(
  provider: PaymentProvider,
  input: CreatePaymentInput,
  compensate: () => Promise<unknown>,
): Promise<PaymentResult> {
  let result: PaymentResult
  try {
    result = await provider.createPayment(input)
  } catch (err) {
    await compensate().catch(() => {
      /* best-effort — voir note de compensation dans lib/booking/actions.ts */
    })
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message:
        err instanceof Error
          ? `Erreur fournisseur de paiement : ${err.message}`
          : "Erreur fournisseur de paiement inconnue.",
    }
  }

  if (!result.ok) {
    await compensate().catch(() => {
      /* best-effort */
    })
  }
  return result
}

/**
 * Référence de paiement — `crypto.randomUUID()` plutôt que `Date.now()` :
 * une référence non garantie unique (deux requêtes dans la même
 * milliseconde, sous charge) ne doit jamais pouvoir collisionner côté PSP
 * une fois un adaptateur réel branché.
 */
export function generateGuestPaymentReference(): string {
  return `guest-${crypto.randomUUID()}`
}
