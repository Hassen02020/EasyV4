/**
 * 3T — documentation officielle reçue (PHASE 28.2) : "Api Hôtel
 * Documentation", version 3.6, 13/02/2026 (section "Authentication &
 * Security" + "Error List" du document Postman fourni par l'utilisateur).
 * `documenter.getpostman.com` reste inaccessible depuis cet environnement
 * (EGRESS_BLOCKED, vérifié à nouveau en Phase 28.2) — ce fichier ne
 * reflète que le texte explicitement fourni, jamais une supposition.
 *
 * CONNU (section "URL & METHOD & HEADERS PARAMS") :
 *   - Base URL  : https://btob.3t.tn
 *   - Méthode   : POST
 *   - Headers   : Content-Type: application/x-www-form-urlencoded,
 *                 Api-key, Login, Password (3 credentials distincts,
 *                 transmis en HEADERS — pas dans le corps de la requête).
 *
 * ENCORE INCONNU — donc AUCUN appel réel n'est possible aujourd'hui :
 *   - Le chemin/action exact de CHAQUE opération (Autocomplete,
 *     Availability, HotelDetails, CheckRate, Book, Cancel, BookingList,
 *     getCountries, getCities, getHotels, getBoardList) — la doc reçue ne
 *     précise pas si l'action est un segment d'URL, un paramètre de
 *     formulaire, ou autre. Sans ça, aucune requête ne peut être
 *     construite correctement, même pour une seule opération.
 *   - Les schémas de requête/réponse par opération (champs exacts :
 *     searchCode, associationId par chambre, identifiants
 *     chambre/board/tarif, structure BookingId, format Cancel...).
 *
 * Voir 3t/driver.ts — driver toujours DOCUMENTATION_REQUIRED tant que ces
 * éléments manquent (aucune opération ne peut être implémentée sans
 * inventer un mécanisme de sélection d'action).
 */

/** Codes d'erreur documentés officiellement — table complète reçue, aucun code deviné. */
export const THREE_T_ERROR_CODES = {
  503: "IP not allowed to access Api.",
  405: "Authentication error, invalid Api-key.",
  308: "Undefined BookingId or BookingId already cancelled.",
  406: "Invalid request or unexpected keys.",
  400: "Bad Request, the server cannot or will not process the request.",
  307: 'Undefined "searchCode" or searchCode already Booked.',
  305: "associationId key should be the same for all rooms.",
} as const

export const THREE_T_BASE_URL = "https://btob.3t.tn"

/**
 * 3T authentifie via 3 credentials distincts transmis en headers HTTP
 * (Api-key, Login, Password) — jamais 2 comme le config précédent le
 * supposait par erreur (aucune opération n'ayant encore été implémentée,
 * cette correction ne change aucun comportement en production).
 */
export function isThreeTConfigured(): boolean {
  return Boolean(
    process.env.THREET_API_KEY &&
      process.env.THREET_LOGIN &&
      process.env.THREET_PASSWORD,
  )
}
