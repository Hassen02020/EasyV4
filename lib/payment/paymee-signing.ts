/**
 * Vérification de signature (`check_sum`) des webhooks Paymee.
 *
 * ⚠️ AVERTISSEMENT — CONTRAT NON VÉRIFIÉ CONTRE LA SOURCE PRIMAIRE ⚠️
 * La documentation officielle Paymee (`https://www.paymee.tn/paymee-
 * integration-with-redirection/`, sandbox `https://sandbox.paymee.tn`,
 * production `https://app.paymee.tn`) est bloquée par la politique réseau
 * de cet environnement de build (curl, WebFetch et un accès direct ont tous
 * les trois échoué avec un rejet de connexion — confirmé, pas supposé).
 * La formule ci-dessous (`md5(token + payment_status("1"/"0") + api_key)`)
 * provient d'un résumé tiers (moteur de recherche, pas la page primaire
 * elle-même) qui cite cette formule comme "officielle" — traitée ici comme
 * un CANDIDAT PLAUSIBLE, PAS une certitude.
 *
 * Conséquence de sécurité assumée si cette formule est fausse : le PIRE cas
 * est que de VRAIS webhooks Paymee soient rejetés (échec de disponibilité,
 * visible dans psp_webhooks.error, corrigible en une ligne) — jamais qu'un
 * webhook FORGÉ soit accepté, puisque `verifyPaymeeChecksum` ÉCHOUE fermé
 * (return false) avant toute écriture DB, exactement comme
 * verifyStripeSignature/verifySpsSignature (voir signing.ts). La
 * corrélation stricte montant/référence dans reservation-payment-logic.ts
 * reste par ailleurs une seconde ligne de défense indépendante de ce
 * fichier.
 *
 * À REVALIDER avant toute mise en production réelle : rejouer un vrai
 * webhook sandbox Paymee (ou lire la doc primaire une fois l'accès réseau
 * possible) et comparer le `check_sum` reçu à `computePaymeeChecksum()`.
 */

import { createHash, timingSafeEqual } from "crypto"

/**
 * Normalise la représentation `payment_status` reçue (Paymee peut la
 * sérialiser en booléen JSON natif, en chaîne "True"/"False" façon Django,
 * ou en "1"/"0") vers un booléen strict. `null` si la valeur est
 * imprévue — ne jamais deviner un statut de paiement.
 */
export function normalizePaymeeStatus(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw
  if (typeof raw === "number") {
    if (raw === 1) return true
    if (raw === 0) return false
    return null
  }
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase()
    if (v === "true" || v === "1") return true
    if (v === "false" || v === "0") return false
  }
  return null
}

/** "1"/"0" — représentation utilisée dans la formule de check_sum candidate. */
function statusBit(status: boolean): "1" | "0" {
  return status ? "1" : "0"
}

/**
 * Calcule le check_sum attendu — voir avertissement de fichier :
 * md5(token + payment_status("1"/"0") + api_key).
 */
export function computePaymeeChecksum(params: {
  token: string
  paymentStatus: boolean
  apiKey: string
}): string {
  const message = `${params.token}${statusBit(params.paymentStatus)}${params.apiKey}`
  return createHash("md5").update(message).digest("hex")
}

/**
 * Vérifie le `check_sum` d'un webhook Paymee. Échoue fermé (false) si
 * `payment_status` n'est pas normalisable ou si `check_sum` est absent —
 * jamais un statut deviné pour pouvoir "quand même" vérifier une signature.
 */
export function verifyPaymeeChecksum(params: {
  token: string
  paymentStatusRaw: unknown
  checkSum: string | null | undefined
  apiKey: string
}): boolean {
  if (!params.checkSum) return false
  const status = normalizePaymeeStatus(params.paymentStatusRaw)
  if (status === null) return false

  const expected = computePaymeeChecksum({
    token: params.token,
    paymentStatus: status,
    apiKey: params.apiKey,
  })
  try {
    return timingSafeEqual(
      Buffer.from(params.checkSum.toLowerCase()),
      Buffer.from(expected.toLowerCase()),
    )
  } catch {
    // Longueurs différentes (check_sum manifestement mal formé) ->
    // timingSafeEqual lève plutôt que de renvoyer false : traité comme un
    // échec de vérification, jamais une exception qui remonte.
    return false
  }
}
