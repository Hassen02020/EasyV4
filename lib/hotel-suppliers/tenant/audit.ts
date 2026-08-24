/**
 * PHASE 27 — Piste d'audit des actions sensibles sur les comptes fournisseur.
 * Réutilise `audit_events` (convention dominante du projet — 29+ sites
 * d'appel avant cette phase, voir lib/admin/actions.ts), jamais une nouvelle
 * table. Écrit TOUJOURS depuis une transaction déjà ouverte
 * (`withTenantContext`/`withSystemContext`) — jamais sa propre connexion.
 *
 * RÈGLE ABSOLUE : `diff`/`metadata` ne contiennent JAMAIS le secret lui-même
 * (ciphertext inclus) — uniquement des faits non sensibles (accountId,
 * supplierId, ownerType, champs modifiés PAR NOM, statut, résultat de test).
 */
import type { DrizzleTransaction } from "@/lib/db/client"
import { auditEvents } from "@/lib/db/schema"

export type SupplierAuditAction =
  | "SUPPLIER_ACCOUNT_CREATED"
  | "SUPPLIER_ACCOUNT_UPDATED"
  | "SUPPLIER_CREDENTIALS_UPDATED"
  | "SUPPLIER_CREDENTIALS_ROTATED"
  | "SUPPLIER_ENABLED"
  | "SUPPLIER_DISABLED"
  | "SUPPLIER_CONNECTION_TESTED"
  | "SUPPLIER_AUTHORIZED"
  | "SUPPLIER_UNAUTHORIZED"

export interface LogSupplierAuditParams {
  agencyId: string
  actorUserId: string | null
  action: SupplierAuditAction
  accountId: string
  diff?: Record<string, unknown>
}

export async function logSupplierAudit(tx: DrizzleTransaction, params: LogSupplierAuditParams): Promise<void> {
  await tx.insert(auditEvents).values({
    agencyId: params.agencyId,
    actorUserId: params.actorUserId,
    entityType: "hotel_supplier_account",
    entityId: params.accountId,
    action: params.action,
    diff: params.diff ?? null,
  })
}

/** Utilitaire de non-régression — vérifie qu'un objet `diff` ne contient jamais de champ secret par erreur d'appel. */
export function assertNoSecretLeak(diff: Record<string, unknown> | undefined): void {
  if (!diff) return
  const forbidden = ["ciphertext", "password", "login", "apiKey", "apiSecret", "token"]
  for (const key of Object.keys(diff)) {
    if (forbidden.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      throw new Error(`Fuite de secret potentielle dans un audit_events.diff — clé suspecte: "${key}"`)
    }
  }
}
