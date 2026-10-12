/**
 * CANCEL-COMMISSION-01 — Reversement de commission Easy2Book lors d'une annulation.
 *
 * Deux opérations atomiques dans la même transaction :
 *
 *  A. `debit_platform_commission()` (SQL SECURITY DEFINER, migration 0133) :
 *     débite wallet_accounts.current_balance et insère une ligne
 *     wallet_ledger (type='adjustment', category='fee', amount=-commissionAmount).
 *     Idempotent via p_idempotency_key = 'commission-reversal:{reservationId}'.
 *
 *  B. INSERT economic_entitlements compensatoire (qualification='commission',
 *     partyType='easy2book', amount négatif) pointant vers la ligne d'origine
 *     via compensatesId — append-only par construction (0092).
 *
 * Guard commun :
 *   - Pas de ligne reservation_financials → no-op silencieux (réservation
 *     antérieure au chantier 37A, commissionAmount non renseigné).
 *   - commissionAmount ≤ 0 → no-op (aucune commission n'avait été prélevée).
 *   - Pas d'entitlement original → on n'insère pas de ligne compensatoire
 *     (le wallet a quand même été débité si commissionAmount > 0).
 *
 * DÉCISION COMMERCIALE REQUISE (non implémentée ici) :
 *   La politique d'annulation (full_reversal / pro_rata_fee / non_refundable)
 *   est lue depuis `economic_entitlements.cancellationTreatment`. En l'absence
 *   de valeur, on applique full_reversal par défaut (conservateur). Direction
 *   doit valider la politique par produit/module avant de déployer pro_rata ou
 *   non_refundable — voir TODO CANCEL-COMMISSION-POLICY-01 ci-dessous.
 */

import { and, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { economicEntitlements, reservationFinancials } from "@/lib/db/schema"
import { PLATFORM_COMMISSION_WALLET_ID } from "./platform-commission"

export async function reverseCommissionOnCancellation(
  tx: DrizzleTransaction,
  params: {
    reservationId: string
    publicRef: string
    actorUserId: string | null
  },
): Promise<void> {
  const { reservationId, publicRef } = params

  // ── 1. Lire commissionAmount depuis reservation_financials ──────────────────
  const [finRow] = await tx
    .select({ commissionAmount: reservationFinancials.commissionAmount })
    .from(reservationFinancials)
    .where(eq(reservationFinancials.reservationId, reservationId))
    .limit(1)

  if (!finRow) return // Réservation antérieure au chantier 37A — no-op

  const commissionAmount = parseFloat(finRow.commissionAmount ?? "0")
  if (commissionAmount <= 0) return // Aucune commission à reverser

  const idempotencyKey = `commission-reversal:${reservationId}`

  // ── A. Débit wallet commission (SECURITY DEFINER, idempotent) ──────────────
  await tx.execute(sql`
    SELECT debit_platform_commission(
      ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
      ${reservationId}::uuid,
      ${commissionAmount}::numeric,
      ${"Reversement commission — annulation " + publicRef},
      ${idempotencyKey}
    )
  `)

  // ── B. Ligne compensatoire economic_entitlements ───────────────────────────
  const [originalEntitlement] = await tx
    .select({
      id: economicEntitlements.id,
      cancellationTreatment: economicEntitlements.cancellationTreatment,
    })
    .from(economicEntitlements)
    .where(
      and(
        eq(economicEntitlements.reservationId, reservationId),
        eq(economicEntitlements.qualification, "commission"),
        eq(economicEntitlements.partyType, "easy2book"),
      ),
    )
    .limit(1)

  if (!originalEntitlement) return // Pas d'entitlement d'origine — wallet débité, pas de compensatoire

  // TODO CANCEL-COMMISSION-POLICY-01 :
  // Direction doit confirmer la politique par module (hotel/flight/transfer/…)
  // avant d'activer pro_rata_fee ou non_refundable.
  // Défaut actuel = full_reversal (conservateur — ne fait jamais pire que reverser la commission).
  const treatment = (originalEntitlement.cancellationTreatment ??
    "full_reversal") as "full_reversal" | "pro_rata_fee" | "non_refundable"

  // Pour non_refundable : la commission est méritée même en annulation — on
  // insère la ligne compensatoire avec amount=0 pour traçabilité mais le wallet
  // a déjà été débité ci-dessus. Ce cas ne devrait pas se produire tant que
  // Direction n'a pas activé cette politique.
  const reversedAmount =
    treatment === "non_refundable" ? 0 : -commissionAmount

  await tx.insert(economicEntitlements).values({
    reservationId,
    partyType: "easy2book",
    partyId: null,
    role: "easy2book",
    qualification: "commission",
    amount: reversedAmount.toFixed(2),
    currency: "TND",
    basis: `Reversement commission — annulation ${publicRef} (${treatment})`,
    status: "pending",
    effectiveAt: new Date(),
    compensatesId: originalEntitlement.id,
    cancellationTreatment: treatment,
  })
}
