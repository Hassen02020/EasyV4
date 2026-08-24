/**
 * PHASE 27 — Types du Control Plane multi-tenant, AU-DESSUS des drivers
 * Phase 26 (lib/hotel-suppliers/core/). Sépare volontairement :
 *   - SupplierAccountOwnerType : master / agency / whitelabel — toujours
 *     dérivé d'une ligne réelle de `agencies` (jamais une hiérarchie inventée).
 *   - ResolvedSupplierAccount : le résultat OPAQUE d'une résolution réussie —
 *     `credentials` n'est JAMAIS interprété ici ni dans le resolver générique,
 *     seul l'adaptateur du driver concerné (ex. buildMyGoConfigFromAccount)
 *     sait quoi en faire.
 */
import type { SupplierName } from "../core/types"
import type { TenantContext } from "@/lib/db/tenant-context"

export type SupplierAccountOwnerType = "master" | "agency" | "whitelabel"
export type SupplierAccountStatus = "active" | "disabled" | "invalid_credentials" | "not_configured" | "error"

export interface ResolveSupplierAccountParams {
  supplierCode: SupplierName
  tenantContext: TenantContext
  /** Compte explicitement demandé par l'appelant — jamais servi pour un autre tenant, quelle que soit la valeur (voir resolver.ts). */
  requestedAccountId?: string
}

export type ResolveSupplierAccountFailureReason =
  | "SUPPLIER_UNKNOWN"
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_DISABLED"
  | "NOT_CONFIGURED"
  | "CREDENTIALS_MISSING"

export interface ResolvedSupplierAccount {
  accountId: string
  supplierId: string
  supplierCode: SupplierName
  ownerType: SupplierAccountOwnerType
  /** Agence PROPRIÉTAIRE du compte — jamais celle qui l'utilise si compte partagé autorisé. */
  ownerAgencyId: string
  mode: string
  timeoutMs: number | null
  priority: number
  /** Déchiffré — jamais loggé, jamais renvoyé au client, interprété uniquement par l'adaptateur du driver correspondant. */
  credentials: Record<string, unknown>
}

export type ResolveSupplierAccountResult =
  | { ok: true; account: ResolvedSupplierAccount }
  | { ok: false; reason: ResolveSupplierAccountFailureReason; message: string }
