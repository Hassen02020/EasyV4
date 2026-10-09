/**
 * Signature HMAC des webhooks PSP — Stripe (header `stripe-signature`) et
 * SPS Monétique Tunisie (champ `seal`).
 *
 * Partagé entre :
 *  - app/api/payment/webhook/route.ts (vérifie une signature reçue)
 *  - lib/payment/virtual-provider.ts (génère une signature valide pour les
 *    tests — même algorithme, donc un payload signé par le virtual
 *    provider est accepté par la même logique que la vraie route utilise,
 *    pas une resimulation séparée qui pourrait diverger).
 *
 * PAY-WEBHOOK-SAFETY-01 / P1-D — fenêtre temporelle Stripe (5 min) :
 * `verifyStripeSignature` rejette les signatures dont le timestamp signé
 * dépasse STRIPE_SIGNATURE_MAX_AGE_SECONDS, conformément à la documentation
 * Stripe (https://stripe.com/docs/webhooks/signatures). Ceci empêche le
 * rejeu d'une signature valide interceptée. Le paramètre `nowSeconds` est
 * injectable pour les tests sans altérer le comportement de production.
 */

import { createHmac, timingSafeEqual } from "crypto"

/**
 * Fenêtre maximale acceptée entre le timestamp signé et l'heure courante.
 * Stripe recommande 300 secondes (5 min). Configurable via env var pour
 * les tests d'intégration qui peuvent avoir une horloge décalée.
 */
export const STRIPE_SIGNATURE_MAX_AGE_SECONDS = Number(
  process.env.STRIPE_SIGNATURE_MAX_AGE_SECONDS ?? 300,
)

/** Calcule la signature Stripe attendue pour un (timestamp, payload). */
export function computeStripeSignature(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  const signed = `${timestamp}.${payload}`
  return createHmac("sha256", secret).update(signed).digest("hex")
}

/** Construit le header `stripe-signature` complet (`t=...,v1=...`). */
export function buildStripeSignatureHeader(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const v1 = computeStripeSignature(payload, secret, timestamp)
  return `t=${timestamp},v1=${v1}`
}

/**
 * Vérifie la signature Stripe (header `stripe-signature`).
 * Utilise `timingSafeEqual` pour éviter les timing attacks.
 *
 * PAY-WEBHOOK-SAFETY-01 / P1-D — rejette aussi les signatures dont le
 * timestamp dépasse STRIPE_SIGNATURE_MAX_AGE_SECONDS (fenêtre anti-rejeu).
 *
 * @param nowSeconds Timestamp courant en secondes — injectable pour les
 *   tests ; si omis, utilise `Math.floor(Date.now() / 1000)`.
 */
export function verifyStripeSignature(
  payload: Buffer,
  sigHeader: string | null,
  secret: string,
  nowSeconds?: number,
): boolean {
  if (!sigHeader) return false
  const parts = Object.fromEntries(
    sigHeader.split(",").map((s) => s.split("=")),
  )
  const timestamp = parts["t"]
  const v1 = parts["v1"]
  if (!timestamp || !v1) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false

  // Rejeter les signatures trop anciennes OU dont le timestamp est dans le
  // futur (possible attaque par pré-signature ou dérive d'horloge malveillante).
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > STRIPE_SIGNATURE_MAX_AGE_SECONDS) return false

  const expected = computeStripeSignature(payload.toString("utf8"), secret, ts)
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}

/** Calcule le `seal` SPS attendu : HMAC-SHA512 des champs triés alphabétiquement. */
export function computeSpsSeal(
  body: Record<string, string>,
  secret: string,
): string {
  const sortedKeys = Object.keys(body)
    .filter((k) => k !== "seal")
    .sort()
  const message = sortedKeys.map((k) => body[k]).join("+")
  return createHmac("sha512", secret).update(message).digest("hex")
}

/**
 * Vérifie la signature SPS Monétique Tunisie (champ `seal` SHA-512).
 * Format SPS : HMAC-SHA512(concatenation des champs triés alphabétiquement)
 */
export function verifySpsSignature(
  body: Record<string, string>,
  secret: string,
): boolean {
  const seal = body["seal"]
  if (!seal) return false
  const expected = computeSpsSeal(body, secret)
  try {
    return timingSafeEqual(
      Buffer.from(seal.toLowerCase()),
      Buffer.from(expected.toLowerCase()),
    )
  } catch {
    return false
  }
}
