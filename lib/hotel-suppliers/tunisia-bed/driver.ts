import type { HotelSupplierDriver } from "../core/supplier"
import { createDocumentationRequiredDriver } from "../core/stub-driver"

/**
 * Tunisia Bed — DOCUMENTATION_REQUIRED. Voir tunisia-bed/config.ts pour le
 * détail. Aucun endpoint/champ n'a été inventé.
 */
export function createTunisiaBedDriver(): HotelSupplierDriver {
  return createDocumentationRequiredDriver("tunisia-bed", "Documentation API Tunisia Bed non fournie")
}
