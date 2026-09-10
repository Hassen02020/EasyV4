import type { HotelSupplierDriver } from "../core/supplier"
import { createDocumentationRequiredDriver } from "../core/stub-driver"

/**
 * 3T — DOCUMENTATION_REQUIRED. PHASE 28.2 : l'utilisateur a fourni le texte
 * de la section "Authentication & Security" + "Error List" de la
 * documentation officielle (base URL, headers d'authentification, table
 * d'erreurs — voir 3t/config.ts) — mais aucun schéma par opération
 * (Autocomplete/Availability/HotelDetails/CheckRate/Book/Cancel/
 * BookingList/getCountries/getCities/getHotels/getBoardList) n'a encore
 * été fourni : ni le mécanisme de sélection d'action (segment d'URL ?
 * paramètre de formulaire ?), ni les champs de requête/réponse. Sans ça,
 * aucune requête HTTP correcte ne peut être construite pour une seule
 * opération — implémenter maintenant reviendrait à deviner. Driver reste
 * donc DOCUMENTATION_REQUIRED pour toutes ses opérations.
 */
export function createThreeTDriver(): HotelSupplierDriver {
  return createDocumentationRequiredDriver(
    "3t",
    "Authentification/erreurs documentées (Phase 28.2), mais schémas de requête/réponse par opération et mécanisme de sélection d'action encore manquants — aucune opération implémentable sans deviner.",
  )
}
