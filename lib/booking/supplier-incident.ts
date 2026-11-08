/**
 * SUPPLIER-INCIDENT-TRACE-01 — trace durable d'une réservation fournisseur
 * peut-être encore active sans réservation locale associée.
 *
 * Constat (audit fournisseurs, 2026-11-08) : quand une réservation myGo /
 * Hôtel Monde reste dans un état incertain (réponse perdue non réconciliée,
 * annulation de rattrapage en échec, hôtel confirmé différent de celui
 * demandé), le client reçoit un message et un journal Vercel (rétention
 * limitée) est émis — mais les écritures d'audit de ces parcours sont DANS la
 * transaction annulée : aucune trace ne survit. Le fournisseur peut alors
 * facturer une chambre jamais payée par le client, sans que l'équipe ait une
 * liste des cas à vérifier.
 *
 * Ici : écriture dans `audit_events` par une transaction SÉPARÉE
 * (withSystemContext), donc indépendante de la transaction de réservation
 * annulée. Ne lève JAMAIS : un échec d'écriture est journalisé et n'altère
 * ni l'erreur d'origine ni la réponse au client.
 *
 * Conservation : famille F09 de docs/DATA_RETENTION_POLICY.md — à exclure de
 * toute purge automatique (purge actuellement désactivée, AUDIT-RETENTION-01).
 */
import { randomUUID } from "node:crypto"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

export type SupplierIncidentKind =
  | "booking_ambiguous"
  | "compensation_failed"
  | "hotel_mismatch"

/** Codes d'audit — audit_events.action est varchar(32). */
export const SUPPLIER_INCIDENT_ACTIONS: Record<SupplierIncidentKind, string> = {
  booking_ambiguous: "supplier.booking_ambiguous",
  compensation_failed: "supplier.compensation_failed",
  hotel_mismatch: "supplier.hotel_mismatch",
}

/** audit_events.entity_type est varchar(32). */
export const SUPPLIER_INCIDENT_ENTITY_TYPE = "supplier_booking"

export interface SupplierIncidentInput {
  agencyId: string
  actorUserId?: string | null
  kind: SupplierIncidentKind
  /** Fournisseur : `mygo` (hôtels Tunisie) ou `hotel_monde`. */
  supplier: "mygo" | "hotel_monde"
  /** Parcours : ex. `hotel_b2c`, `hotel_b2b`, `hotel_monde_b2c`. */
  flow: string
  /** Étape où l'incident survient (ex. `price_drift`, `transaction_failed`). */
  step: string
  /** Référence de réservation fournisseur, si connue (null si réponse perdue). */
  supplierBookingRef: string | null
  hotelId?: string | number | null
  checkIn?: string | null
  checkOut?: string | null
  error?: unknown
}

function errorMessage(err: unknown): string | null {
  if (err === undefined || err === null) return null
  return (err instanceof Error ? err.message : String(err)).slice(0, 500)
}

export async function recordSupplierIncident(
  input: SupplierIncidentInput,
): Promise<boolean> {
  const action = SUPPLIER_INCIDENT_ACTIONS[input.kind]
  const entityId =
    input.supplierBookingRef ??
    `${input.supplier}:unknown:${input.hotelId ?? "?"}:${input.checkIn ?? "?"}:${randomUUID().slice(0, 8)}`
  const diff = {
    supplier: input.supplier,
    flow: input.flow,
    step: input.step,
    supplierBookingRef: input.supplierBookingRef,
    hotelId: input.hotelId ?? null,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    error: errorMessage(input.error),
    note: "Réservation fournisseur peut-être encore active sans réservation locale — vérifier et annuler chez le fournisseur (SUPPLIER-INCIDENT-TRACE-01).",
  }
  logger.error("[supplier-incident] " + action, { ...diff })
  try {
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId: input.agencyId,
        actorUserId: input.actorUserId ?? null,
        entityType: SUPPLIER_INCIDENT_ENTITY_TYPE,
        entityId,
        action,
        diff,
      }),
    )
    return true
  } catch (err) {
    logger.error("[supplier-incident] écriture de la trace impossible", {
      action,
      supplierBookingRef: input.supplierBookingRef,
      err: errorMessage(err),
    })
    return false
  }
}
