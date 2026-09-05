/**
 * Virtual Payment Provider — implémentation RÉELLE de `PaymentProvider`,
 * mais purement test/dev, jamais activable en production (voir
 * `isVirtualPaymentModeEnabled()` ci-dessous et `.env.example`).
 *
 * Contrairement à `NotConfiguredPaymentProvider` (qui échoue toujours),
 * celui-ci simule le modèle réel d'un PSP hébergé (SPS Monétique Tunisie/
 * Paymee/Stripe Checkout) : `createPayment()` ne confirme JAMAIS de façon
 * synchrone — il renvoie `status: "requires_action"` + une `redirectUrl`
 * vers une page LOCALE clairement labellisée "simulation"
 * (app/paiement-simule/[ref]/page.tsx), qui déclenche ensuite le VRAI
 * webhook signé (app/api/payment/reservation-webhook/route.ts) exactement
 * comme le ferait un vrai PSP — aucune confirmation locale bidon, le webhook
 * reste la SEULE source de vérité, ce qui permet de tester bout-en-bout tout
 * le mécanisme (idempotence, vérification montant/devise, transition
 * d'état, facture, notification) sans jamais fabriquer un contrat d'API PSP
 * réel non vérifié.
 *
 * Format de signature simulé : SPS Monétique Tunisie (form-urlencoded, seal
 * HMAC-SHA512 — voir lib/payment/signing.ts et
 * lib/payment/virtual-provider.ts::buildVirtualWebhookRequest, réutilisé tel
 * quel, déjà utilisé pour les tests du webhook wallet B2B). `payments.psp`
 * reste `'virtual'` (jamais `'sps'`) pour ne jamais confondre un paiement de
 * test avec un vrai paiement SPS dans les rapports staff.
 */

import type { CreatePaymentInput, PaymentProvider, PaymentResult, PaymentStatusResult } from "./provider"

/**
 * Jamais vrai en production : `PAYMENT_MODE` n'est documenté dans
 * `.env.example` qu'avec la valeur par défaut absente (donc "non
 * configuré") — seul un `.env.local` de dev/test explicite peut le poser à
 * "virtual", exactement comme `MYGO_MODE=virtual`.
 */
export function isVirtualPaymentModeEnabled(): boolean {
  return process.env.PAYMENT_MODE === "virtual"
}

export class VirtualPaymentProvider implements PaymentProvider {
  readonly name = "virtual"
  readonly configured = true

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return {
      ok: true,
      status: "requires_action",
      providerPaymentId: input.reference,
      psp: "virtual",
      redirectUrl: `/paiement-simule/${encodeURIComponent(input.reference)}`,
    }
  }

  // La confirmation réelle passe TOUJOURS par le webhook signé (voir note
  // de fichier) — ces méthodes ne sont appelées par aucun flux réel
  // aujourd'hui (même constat que NotConfiguredPaymentProvider), gardées
  // pour compléter l'interface sans fabriquer de comportement.
  async confirmPayment(): Promise<PaymentResult> {
    return { ok: false, code: "PAYMENT_NOT_FOUND", message: "Confirmation via webhook uniquement." }
  }

  async refundPayment(): Promise<PaymentResult> {
    return { ok: false, code: "PAYMENT_NOT_FOUND", message: "Remboursement via webhook PSP uniquement." }
  }

  async getPaymentStatus(): Promise<PaymentStatusResult> {
    return { found: false }
  }
}
