/**
 * WALLET-PAYMEE-INIT-01 — retour client après une recharge Paymee.
 *
 * La page wallet reçoit `?topup=<id de customer_topup_requests>` et affiche
 * l'état RÉEL de la demande (lu en base, restreint au client connecté),
 * jamais un état déduit de l'URL : seul le webhook signé crédite le wallet.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type TopupReturnFeedback = "completed" | "pending" | "failed"

/** Identifiant de demande exploitable, sinon null (paramètre absent, ancien
 * format `success`/`cancelled`, ou valeur arbitraire). */
export function parseTopupReturnId(raw: string | undefined): string | null {
  return raw && UUID_PATTERN.test(raw) ? raw : null
}

/** Statut de la demande → message affiché. Statut inconnu ou demande
 * introuvable : aucun message (jamais une confirmation inventée). */
export function topupReturnFeedback(
  status: string | null | undefined,
): TopupReturnFeedback | null {
  if (status === "completed") return "completed"
  if (status === "pending") return "pending"
  if (status === "failed") return "failed"
  return null
}
