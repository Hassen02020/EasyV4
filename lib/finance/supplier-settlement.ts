/**
 * Règlement des dettes fournisseur Network — SUPPLIER-SETTLEMENT-01.
 *
 * Toute la logique d'intégrité (cascade sélective, note de vérification
 * obligatoire, garde anti-net-négatif, montant de réversion auto-calculé,
 * vérification de l'acteur) vit dans `drizzle/manual/0135_supplier_settlement_01.sql`
 * (5 fonctions SECURITY DEFINER). Ce fichier n'est qu'un mince wrapper
 * TypeScript — même répartition des responsabilités que
 * `lib/finance/commission-settlement.ts` / `platform-commission.ts`.
 *
 * PÉRIMÈTRE V1 (vérifié contre le dépôt réel, voir en-tête de 0135) : UNIQUEMENT
 * les créances `economic_entitlements.qualification='supplier_cost'` dont
 * `party_type='supplier_node'` — c'est-à-dire, aujourd'hui, le module Network
 * (`lib/network/product-booking-actions.ts`). Toute autre créance est rejetée
 * par la fonction SQL elle-même (`SUPPLIER_SETTLEMENT_UNSUPPORTED_PARTY_TYPE`),
 * jamais par ce fichier — pas de logique de filtrage dupliquée côté TypeScript.
 *
 * Autorisation : `requireSuperAdmin()` est résolu par l'appelant (voir
 * `lib/finance/supplier-settlement-actions.ts`), exactement comme
 * `commission-settlement.ts` documente "vérifié en amont par l'appelant" —
 * et, en plus, chaque fonction SQL revérifie elle-même l'acteur
 * (`assert_supplier_settlement_actor`), défense en profondeur déjà prouvée.
 */

"use server"

import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"

export interface SupplierSettlementEntryInput {
  entitlementId: string
  amount: number
  cancellationReviewNote?: string
}

export async function declareSupplierSettlement(
  actorUserId: string,
  supplierId: string,
  entries: SupplierSettlementEntryInput[],
  proofReference: string | null,
  notes: string | null,
): Promise<string> {
  const payload = entries.map((e) => ({
    entitlement_id: e.entitlementId,
    amount: e.amount,
    cancellation_review_note: e.cancellationReviewNote ?? null,
  }))
  return withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT declare_supplier_settlement(
        ${actorUserId}::uuid, ${supplierId}::uuid, ${JSON.stringify(payload)}::jsonb,
        ${proofReference}, ${notes}
      ) AS id
    `)
    return row!.id
  })
}

export async function confirmSupplierSettlement(
  actorUserId: string,
  settlementId: string,
): Promise<void> {
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${actorUserId}::uuid, ${settlementId}::uuid)`,
    ),
  )
}

export async function cancelSupplierSettlementDeclaration(
  actorUserId: string,
  settlementId: string,
): Promise<void> {
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT cancel_supplier_settlement_declaration(${actorUserId}::uuid, ${settlementId}::uuid)`,
    ),
  )
}

export async function requestSupplierSettlementCorrection(
  actorUserId: string,
  entitlementId: string,
  targetSettlementId: string | null,
  correctionCause: "calculation_error" | "duplicate_entry" | "supplier_refund",
  amount: number,
  externalReference: string | null,
  cancellationReviewNote: string | null,
): Promise<string> {
  return withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT request_supplier_settlement_correction(
        ${actorUserId}::uuid, ${entitlementId}::uuid, ${targetSettlementId}::uuid,
        ${correctionCause}, ${amount}, ${externalReference}, ${cancellationReviewNote}
      ) AS id
    `)
    return row!.id
  })
}

export async function requestSupplierSettlementReversal(
  actorUserId: string,
  targetSettlementId: string,
  reversalCause:
    | "rejected_payment"
    | "erroneous_confirmation"
    | "duplicate_payment"
    | "other",
  reference: string | null,
): Promise<string> {
  return withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT request_supplier_settlement_reversal(
        ${actorUserId}::uuid, ${targetSettlementId}::uuid, ${reversalCause}, ${reference}
      ) AS id
    `)
    return row!.id
  })
}

export interface SupplierDueEntitlement {
  entitlementId: string
  reservationId: string
  amount: string
  reservationStatus: string
  /** true si la réservation est annulée/remboursée — règlement bloqué sans note (0135). */
  disputedCancellation: boolean
}

/**
 * Liste les créances `supplier_cost`/`supplier_node` d'un fournisseur n'ayant
 * aucune jonction normale active (`due() > 0` au sens du dossier de conception
 * — approximé ici par "aucune entrée active", V1 ne couvre pas encore les
 * corrections `calculation_error`/`duplicate_entry` dans cette requête de
 * lecture, cf. limites connues).
 */
export async function listUnsettledSupplierDebts(
  supplierNodeId: string,
): Promise<SupplierDueEntitlement[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx.execute<{
      entitlement_id: string
      reservation_id: string
      amount: string
      reservation_status: string
    }>(sql`
      SELECT ee.id AS entitlement_id, ee.reservation_id, ee.amount, r.status AS reservation_status
      FROM economic_entitlements ee
      JOIN reservations r ON r.id = ee.reservation_id
      WHERE ee.qualification = 'supplier_cost'
        AND ee.party_type = 'supplier_node'
        AND ee.party_id = ${supplierNodeId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM supplier_settlement_entries se
          WHERE se.entitlement_id = ee.id AND se.unlinked_at IS NULL AND se.entry_kind = 'normal'
        )
    `)
    return rows.map((r) => ({
      entitlementId: r.entitlement_id,
      reservationId: r.reservation_id,
      amount: r.amount,
      reservationStatus: r.reservation_status,
      disputedCancellation:
        r.reservation_status === "cancelled" ||
        r.reservation_status === "refunded",
    }))
  })
}
