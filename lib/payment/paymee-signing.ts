/**
 * Vérification de signature (`check_sum`) des webhooks Paymee.
 *
 * Formule confirmée contre la documentation officielle Paymee (fournie
 * directement par l'utilisateur) : `check_sum = md5(token +
 * payment_status("1"/"0") + API Token)` — identique à l'implémentation
 * ci-dessous, plus une certitude un « candidat plausible ».
 *
 * `verifyPaymeeChecksum` continue d'échouer fermé (return false) si
 * `payment_status` n'est pas normalisable ou si `check_sum` est absent —
 * jamais un statut deviné pour pouvoir "quand même" vérifier une signature,
 * exactement comme verifyStripeSignature/verifySpsSignature (voir
 * signing.ts). La corrélation stricte montant/référence dans
 * reservation-payment-logic.ts reste une seconde ligne de défense
 * indépendante de ce fichier.
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
