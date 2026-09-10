/**
 * Clé d'idempotence pour une ligne panier Hôtel — calculée côté navigateur
 * (Web Crypto SubtleCrypto, `crypto.createHash` de Node n'existe pas dans
 * le navigateur) pour un même contenu (brouillon + voyageur + mode de
 * paiement) : un double-clic sur "Confirmer le panier" reproduit la même
 * clé, ne crée jamais une deuxième réservation (voir
 * createGuestReservationFromDraft, lib/booking/guest-actions.ts, qui
 * l'exige déjà tel quel).
 */
export async function computeIdempotencyKey(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
