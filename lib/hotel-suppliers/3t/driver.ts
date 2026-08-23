import type { HotelSupplierDriver } from "../core/supplier"
import { createDocumentationRequiredDriver } from "../core/stub-driver"

/**
 * 3T — DOCUMENTATION_REQUIRED. La documentation Postman fournie
 * (documenter.getpostman.com) est inaccessible depuis cet environnement
 * (égress réseau bloqué) — voir 3t/config.ts.
 */
export function createThreeTDriver(): HotelSupplierDriver {
  return createDocumentationRequiredDriver(
    "3t",
    "Documentation Postman fournie mais inaccessible depuis cet environnement (documenter.getpostman.com bloqué par la politique d'égress réseau)",
  )
}
