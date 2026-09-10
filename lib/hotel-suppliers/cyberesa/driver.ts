import type { HotelSupplierDriver } from "../core/supplier"
import { createDocumentationRequiredDriver } from "../core/stub-driver"

/**
 * Cyberesa — DOCUMENTATION_REQUIRED. Voir cyberesa/config.ts.
 */
export function createCyberesaDriver(): HotelSupplierDriver {
  return createDocumentationRequiredDriver("cyberesa", "Documentation API Cyberesa non fournie")
}
