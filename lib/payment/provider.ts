/**
 * PaymentProvider — abstraction pour le paiement B2C en ligne.
 *
 * Contexte : `lib/payment/virtual-provider.ts`/`webhook-logic.ts` gèrent
 * déjà le côté ENTRANT d'un paiement PSP (vérification de signature,
 * normalisation Stripe/SPS) — mais uniquement pour la recharge de wallet
 * B2B (`wallet_recharge_requests`). Aucun code de ce projet ne crée
 * aujourd'hui un PaymentIntent Stripe ni une session SPS réels (confirmé
 * par le commentaire de tête de `webhook-logic.ts`). Cette abstraction est
 * le premier côté SORTANT — nécessaire pour qu'un client B2C puisse payer
 * une réservation sans passer par le wallet d'une agence partenaire
 * (voir lib/booking/guest-actions.ts).
 *
 * Volontairement non implémentée avec un vrai SDK Stripe/SPS ici : la
 * Tunisie n'est pas dans la liste des devises de règlement supportées par
 * Stripe (TND), et aucune documentation d'intégration SPS vérifiée n'est
 * disponible dans ce repo (contrairement à myGo, dont le PDF fournisseur
 * avait servi de référence) — écrire un adaptateur "réel" ici serait
 * deviner un contrat d'API non vérifié, exactement ce que ce projet
 * s'interdit (voir la règle anti-fabrication déjà appliquée à Vols/Hôtels
 * Monde). Le comportement honnête par défaut est donc
 * `PAYMENT_PROVIDER_NOT_CONFIGURED` — jamais un faux SUCCESS.
 *
 * E2B-003 — Paymee (lib/payment/paymee-provider.ts) EST un adaptateur réel
 * (appel HTTP effectif à l'API Paymee, jamais de simulation locale), câblé
 * ci-dessous derrière `PAYMENT_PROVIDER=paymee` + `PAYMEE_API_KEY` — voir le
 * fichier pour l'avertissement complet sur les parties du contrat Paymee
 * non vérifiables dans cet environnement de build (accès réseau à
 * paymee.tn bloqué). Stripe/SPS restent non branchés pour les raisons
 * ci-dessus (TND non supporté par Stripe, doc SPS jamais obtenue).
 */

import { VirtualPaymentProvider, isVirtualPaymentModeEnabled } from "./virtual-payment-provider"
import { PaymeePaymentProvider, isPaymeeSelected } from "./paymee-provider"

export type PaymentProviderCode =
  | "PAYMENT_PROVIDER_NOT_CONFIGURED"
  | "PAYMENT_DECLINED"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_ALREADY_CAPTURED"
  | "PAYMENT_NOT_FOUND"
  | "PROVIDER_ERROR"

export interface CreatePaymentInput {
  /** Montant EXACT à capturer, en TND (3 décimales) — toujours calculé
   * côté serveur, jamais transmis par le client. */
  amountTnd: number
  currency: "TND"
  /** Référence interne (ex. le `publicRef` de la réservation à venir). */
  reference: string
  description: string
  customerEmail: string
  /** Requis par certains PSP réels (ex. Paymee : first_name/last_name/phone
   * obligatoires côté API) — optionnels ici pour ne pas casser les
   * providers existants (Virtual/NotConfigured) qui les ignorent. */
  customerFirstName?: string
  customerLastName?: string
  customerPhone?: string
}

export interface PaymentResult {
  ok: boolean
  code?: PaymentProviderCode
  message?: string
  /** Identifiant du paiement côté provider — absent si `ok:false`. */
  providerPaymentId?: string
  /** Statut normalisé, indépendant du provider réel. */
  status?: "requires_action" | "succeeded" | "failed" | "refunded"
  /** Présent uniquement quand `status: "requires_action"` — URL de la page
   * de paiement hébergée par le PSP vers laquelle rediriger le navigateur
   * (modèle SPS Monétique Tunisie/Stripe Checkout : le paiement lui-même
   * n'est jamais confirmé de façon synchrone ici, seulement via le webhook
   * signé une fois le client revenu de cette page — voir
   * app/api/payment/reservation-webhook/route.ts). */
  redirectUrl?: string
  /** Présent uniquement quand `status: "requires_action"` — PSP réel qui va
   * confirmer via webhook, pour poser `payments.psp` correctement (jamais
   * déduit de `provider.name`, qui n'a pas la même contrainte d'enum DB). */
  psp?: "sps" | "stripe" | "manual" | "virtual" | "paymee"
}

export interface PaymentStatusResult {
  found: boolean
  status?: "pending" | "succeeded" | "failed" | "refunded"
  amountTnd?: number
}

/**
 * Contrat minimal qu'un fournisseur de paiement en ligne doit implémenter.
 * Aucune méthode ne doit jamais retourner `ok: true`/`status: "succeeded"`
 * sans confirmation réelle du provider — pas de simulation locale.
 */
export interface PaymentProvider {
  readonly name: string
  readonly configured: boolean
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>
  confirmPayment(providerPaymentId: string): Promise<PaymentResult>
  refundPayment(providerPaymentId: string, amountTnd?: number): Promise<PaymentResult>
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>
}

/**
 * Provider honnête par défaut — utilisé tant qu'aucune clé de paiement
 * réelle (`STRIPE_SECRET_KEY`, `SPS_SECRET_KEY`, ...) n'est configurée.
 * Ne fabrique jamais de succès : toute tentative de paiement en ligne
 * échoue explicitement avec `PAYMENT_PROVIDER_NOT_CONFIGURED`.
 */
class NotConfiguredPaymentProvider implements PaymentProvider {
  readonly name = "not_configured"
  readonly configured = false

  async createPayment(): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
      message:
        "Le paiement en ligne n'est pas encore disponible. Merci de choisir un règlement par virement ou en agence, ou de nous contacter.",
    }
  }

  async confirmPayment(): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
      message: "Aucun fournisseur de paiement configuré.",
    }
  }

  async refundPayment(): Promise<PaymentResult> {
    return {
      ok: false,
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
      message: "Aucun fournisseur de paiement configuré.",
    }
  }

  async getPaymentStatus(): Promise<PaymentStatusResult> {
    return { found: false }
  }
}

/**
 * Résout si un fournisseur de paiement en ligne réel semble configuré
 * (présence des clés secrètes attendues, jamais leur valeur). Ne préjuge
 * pas de leur validité — seule une vraie tentative d'appel le confirmerait,
 * ce que cette fonction pure ne fait jamais.
 */
export function hasConfiguredPaymentProvider(): boolean {
  return (
    Boolean(process.env.STRIPE_SECRET_KEY) ||
    Boolean(process.env.SPS_SECRET_KEY) ||
    (isPaymeeSelected() && Boolean(process.env.PAYMEE_API_KEY))
  )
}

/**
 * Point d'entrée unique. Retourne toujours un `PaymentProvider` valide —
 * le provider "non configuré" honnête tant qu'aucun adaptateur réel n'est
 * branché ici (voir note de fichier).
 */
export function getPaymentProvider(): PaymentProvider {
  // Virtual Payment Provider — test/dev UNIQUEMENT (voir
  // lib/payment/virtual-payment-provider.ts::isVirtualPaymentModeEnabled,
  // jamais vrai en production, même garde que MYGO_MODE=virtual). Vérifié
  // AVANT `hasConfiguredPaymentProvider()` : les deux ne peuvent jamais
  // être vrais en même temps en pratique (aucune vraie clé PSP n'est
  // censée exister dans un environnement PAYMENT_MODE=virtual), mais si
  // jamais elles l'étaient, le mode virtuel explicite gagne — un
  // environnement de test ne doit jamais basculer accidentellement sur un
  // vrai PSP.
  if (isVirtualPaymentModeEnabled()) {
    return new VirtualPaymentProvider()
  }
  // E2B-003 — Paymee, sélectionné explicitement par PAYMENT_PROVIDER=paymee
  // (jamais un défaut implicite). `PaymeePaymentProvider` reste lui-même
  // honnête si `PAYMEE_API_KEY` est absent (voir paymee-provider.ts) —
  // jamais un faux succès même si la variable de sélection est mal posée
  // sans la clé.
  if (isPaymeeSelected()) {
    return new PaymeePaymentProvider()
  }
  // Aucun autre adaptateur réel n'est branché aujourd'hui (voir note de
  // fichier : devise TND non supportée par Stripe, contrat SPS non
  // vérifié). Le jour où un adaptateur réel existe, l'ajouter ici en le
  // sélectionnant selon `hasConfiguredPaymentProvider()` — ne jamais
  // changer le comportement par défaut en dehors de ce point unique.
  return new NotConfiguredPaymentProvider()
}
