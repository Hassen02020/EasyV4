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

export interface SupplierSettlementEntryRow {
  id: string
  entitlementId: string
  entryKind: "normal" | "amount_correction" | "reversal"
  amount: string
  unlinkedAt: string | null
  cancellationReviewNote: string | null
}

export interface SupplierSettlementRow {
  id: string
  status: string
  correctionType: "amount_correction" | "reversal" | null
  correctionCause:
    | "calculation_error"
    | "duplicate_entry"
    | "supplier_refund"
    | null
  reversalCause: string | null
  correctsSettlementId: string | null
  reversedBySettlementId: string | null
  totalAmount: string
  proofReference: string | null
  externalReference: string | null
  notes: string | null
  declaredAt: string | null
  confirmedAt: string | null
  createdAt: string
  entries: SupplierSettlementEntryRow[]
}

/**
 * Historique des règlements (normaux + corrections + réversions) d'un
 * fournisseur Network, entrées incluses (`json_agg` — même lecture
 * cohérente qu'une jointure, sans N+1 par ligne de la page admin).
 */
export async function listSupplierSettlements(
  supplierNodeId: string,
): Promise<SupplierSettlementRow[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx.execute<{
      id: string
      status: string
      correction_type: "amount_correction" | "reversal" | null
      correction_cause:
        | "calculation_error"
        | "duplicate_entry"
        | "supplier_refund"
        | null
      reversal_cause: string | null
      corrects_settlement_id: string | null
      reversed_by_settlement_id: string | null
      total_amount: string
      proof_reference: string | null
      external_reference: string | null
      notes: string | null
      declared_at: string | null
      confirmed_at: string | null
      created_at: string
      entries: {
        id: string
        entitlementId: string
        entryKind: "normal" | "amount_correction" | "reversal"
        amount: string
        unlinkedAt: string | null
        cancellationReviewNote: string | null
      }[]
    }>(sql`
      SELECT
        s.id, s.status, s.correction_type, s.correction_cause, s.reversal_cause,
        s.corrects_settlement_id, s.reversed_by_settlement_id, s.total_amount,
        s.proof_reference, s.external_reference, s.notes,
        s.declared_at, s.confirmed_at, s.created_at,
        COALESCE(
          (SELECT json_agg(json_build_object(
             'id', se.id,
             'entitlementId', se.entitlement_id,
             'entryKind', se.entry_kind,
             'amount', se.amount,
             'unlinkedAt', se.unlinked_at,
             'cancellationReviewNote', se.cancellation_review_note
           ) ORDER BY se.created_at)
           FROM supplier_settlement_entries se
           WHERE se.settlement_id = s.id),
          '[]'::json
        ) AS entries
      FROM supplier_settlements s
      WHERE s.supplier_id = ${supplierNodeId}::uuid
      ORDER BY s.created_at DESC
      LIMIT 200
    `)
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      correctionType: r.correction_type,
      correctionCause: r.correction_cause,
      reversalCause: r.reversal_cause,
      correctsSettlementId: r.corrects_settlement_id,
      reversedBySettlementId: r.reversed_by_settlement_id,
      totalAmount: r.total_amount,
      proofReference: r.proof_reference,
      externalReference: r.external_reference,
      notes: r.notes,
      declaredAt: r.declared_at,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
      entries: r.entries,
    }))
  })
}

export interface SupplierDueEntitlement {
  entitlementId: string
  reservationId: string
  /** Montant d'origine, immuable (jamais modifié rétroactivement). */
  amount: string
  reservationStatus: string
  /** `amount(O) + Σ(corrections actives calculation_error/duplicate_entry)`. */
  recognizedDebt: string
  /** Σ jonctions actives `entry_kind='normal'` — argent réellement transféré au fournisseur. */
  paidReal: string
  /** `paidReal + refunded(O)` — `refunded` est déjà stocké négatif, donc une
   * addition (jamais une soustraction) ; position de caisse réelle nette. */
  netDecaisse: string
  /** `max(0, paidReal − recognizedDebt)` — remboursement exclu de la dette réglée. */
  overpaid: string
  /** `max(0, recognizedDebt − paidReal)` — un remboursement ne rouvre pas le reste dû. */
  remaining: string
  /** true si la réservation est annulée/remboursée — règlement bloqué sans note (0135). */
  disputedCancellation: boolean
}

/**
 * Liste les créances `supplier_cost`/`supplier_node` d'un fournisseur ayant
 * encore un reste à payer OU un trop-payé.
 *
 * CORRIGÉ APRÈS AUDIT (étape 3, mission de sécurisation) : la version
 * précédente se contentait de vérifier "aucune jonction normale active" —
 * elle ignorait les corrections `calculation_error`/`duplicate_entry` (donc
 * `recognizedDebt` pouvait différer de `amount` sans que cette fonction le
 * voie) et, surtout, aurait **masqué un trop-payé réel** derrière "une
 * écriture normale existe donc c'est réglé". Reprend exactement les formules
 * des fonctions SQL (0135) : un remboursement réel (`supplier_refund`) ne
 * rouvre jamais `remaining`, il ne fait baisser que `netDecaisse` — exposé
 * séparément, jamais confondu avec `remaining`/`overpaid`.
 *
 * CORRIGÉ ENCORE (audit complémentaire) — deux bugs réels trouvés :
 * 1. Signe de `net_decaisse` : un remboursement (`supplier_refund`) est
 *    TOUJOURS stocké négatif (contrainte SQL `REFUND_MUST_BE_NEGATIVE`,
 *    0135). `paid_real − refunded` SOUSTRAYAIT donc un nombre négatif, ce qui
 *    AJOUTAIT au lieu de déduire (1000 − (−150) = 1150, au lieu de 850).
 *    Corrigé en `paid_real + refunded` (addition, puisque le signe est déjà
 *    porté par la valeur stockée).
 * 2. Aucun filtre `s.status = 'paid'` : une jonction d'un règlement encore
 *    `declared`/`pending` (jamais confirmé) ou `cancelled` était comptée
 *    comme un paiement/remboursement/correction réel — un paiement fantôme.
 *    Une réservation annulée avant confirmation, ou une déclaration annulée,
 *    ne doit jamais apparaître comme un flux de trésorerie réel. Seules les
 *    lignes `unlinked_at IS NULL` ET dont le règlement parent est
 *    effectivement `status='paid'` comptent désormais, pour les 3 agrégats
 *    (paid_real, recognized_adjustment, refunded).
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
      recognized_debt: string
      paid_real: string
      net_decaisse: string
      overpaid: string
      remaining: string
    }>(sql`
      WITH agg AS (
        SELECT
          se.entitlement_id,
          COALESCE(SUM(se.amount) FILTER (
            WHERE se.entry_kind = 'normal' AND se.unlinked_at IS NULL AND s.status = 'paid'
          ), 0) AS paid_real,
          COALESCE(SUM(se.amount) FILTER (
            WHERE se.entry_kind = 'amount_correction' AND se.unlinked_at IS NULL AND s.status = 'paid'
              AND s.correction_cause IN ('calculation_error', 'duplicate_entry')
          ), 0) AS recognized_adjustment,
          COALESCE(SUM(se.amount) FILTER (
            WHERE se.entry_kind = 'amount_correction' AND se.unlinked_at IS NULL AND s.status = 'paid'
              AND s.correction_cause = 'supplier_refund'
          ), 0) AS refunded
        FROM supplier_settlement_entries se
        JOIN supplier_settlements s ON s.id = se.settlement_id
        GROUP BY se.entitlement_id
      )
      SELECT
        ee.id AS entitlement_id, ee.reservation_id, ee.amount, r.status AS reservation_status,
        (ee.amount + COALESCE(agg.recognized_adjustment, 0)) AS recognized_debt,
        COALESCE(agg.paid_real, 0)::numeric(14,2) AS paid_real,
        (COALESCE(agg.paid_real, 0) + COALESCE(agg.refunded, 0))::numeric(14,2) AS net_decaisse,
        GREATEST(0, COALESCE(agg.paid_real, 0) - (ee.amount + COALESCE(agg.recognized_adjustment, 0)))::numeric(14,2) AS overpaid,
        GREATEST(0, (ee.amount + COALESCE(agg.recognized_adjustment, 0)) - COALESCE(agg.paid_real, 0))::numeric(14,2) AS remaining
      FROM economic_entitlements ee
      JOIN reservations r ON r.id = ee.reservation_id
      LEFT JOIN agg ON agg.entitlement_id = ee.id
      WHERE ee.qualification = 'supplier_cost'
        AND ee.party_type = 'supplier_node'
        AND ee.party_id = ${supplierNodeId}::uuid
        AND (
          GREATEST(0, COALESCE(agg.paid_real, 0) - (ee.amount + COALESCE(agg.recognized_adjustment, 0))) > 0
          OR GREATEST(0, (ee.amount + COALESCE(agg.recognized_adjustment, 0)) - COALESCE(agg.paid_real, 0)) > 0
        )
    `)
    return rows.map((r) => ({
      entitlementId: r.entitlement_id,
      reservationId: r.reservation_id,
      amount: r.amount,
      reservationStatus: r.reservation_status,
      recognizedDebt: r.recognized_debt,
      paidReal: r.paid_real,
      netDecaisse: r.net_decaisse,
      overpaid: r.overpaid,
      remaining: r.remaining,
      disputedCancellation:
        r.reservation_status === "cancelled" ||
        r.reservation_status === "refunded",
    }))
  })
}
