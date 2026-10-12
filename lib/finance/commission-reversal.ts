/**
 * CANCEL-COMMISSION-01 — Reversement de commission Easy2Book lors d'une annulation.
 *
 * Deux opérations atomiques dans la même transaction :
 *
 *  A. `debit_platform_commission()` (SQL SECURITY DEFINER, migration 0133) :
 *     débite wallet_accounts.current_balance et insère une ligne
 *     wallet_ledger (type='adjustment', category='fee', amount=-montant).
 *     Idempotent via p_idempotency_key = 'commission-reversal:{reservationId}'.
 *
 *  B. INSERT economic_entitlements compensatoire (qualification='commission',
 *     partyType='easy2book', amount négatif) pointant vers la ligne d'origine
 *     via compensatesId — append-only par construction (0092).
 *
 * Ordre d'exécution :
 *   1. Lire reservation_financials → garde rapide si aucune commission
 *   2. Lire l'entitlement d'origine (AVANT tout débit) :
 *      - Absent         → no-op + warn (impossible de vérifier le crédit initial)
 *      - non_refundable → insert 0.00 traçabilité uniquement, PAS de débit wallet
 *      - full_reversal  → débit wallet + insert compensatoire (montant = entitlement)
 *      - pro_rata_fee   → TODO CANCEL-COMMISSION-POLICY-01 (Direction) ; fallback full_reversal
 *   3. Montant autorisé = |originalEntitlement.amount|, pas reservationFinancials.commissionAmount
 *      (l'entitlement est la trace comptable de ce qui a été effectivement crédité)
 *
 * DÉCISION COMMERCIALE REQUISE (TODO CANCEL-COMMISSION-POLICY-01) :
 *   Direction doit valider full_reversal / pro_rata_fee / non_refundable par
 *   produit/module avant déploiement de ces variantes.
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

  // ── 1. Garde rapide : commissionAmount dans reservation_financials ──────────
  const [finRow] = await tx
    .select({ commissionAmount: reservationFinancials.commissionAmount })
    .from(reservationFinancials)
    .where(eq(reservationFinancials.reservationId, reservationId))
    .limit(1)

  if (!finRow) return // Réservation antérieure au chantier 37A — no-op
  const earlyAmount = parseFloat(finRow.commissionAmount ?? "0")
  if (earlyAmount <= 0) return // Aucune commission enregistrée

  // ── 2. Entitlement d'origine AVANT tout débit ──────────────────────────────
  // L'entitlement est la preuve comptable que la commission a bien été créditée
  // et quel montant a été effectivement enregistré. Sans lui, le débit serait
  // aveugle — on s'abstient (conservateur) et on alerte pour investigation.
  const [originalEntitlement] = await tx
    .select({
      id: economicEntitlements.id,
      amount: economicEntitlements.amount,
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

  if (!originalEntitlement) {
    // Pas de trace comptable initiale : ne pas débiter le wallet.
    // Cas attendus : réservation antérieure aux entitlements, ou erreur amont.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_NO_ENTITLEMENT",
        reservationId,
        earlyAmount,
        ts: new Date().toISOString(),
      }),
    )
    return
  }

  // ── 3. Politique d'annulation ──────────────────────────────────────────────
  // TODO CANCEL-COMMISSION-POLICY-01 : Direction doit confirmer par module.
  const treatment = (originalEntitlement.cancellationTreatment ??
    "full_reversal") as "full_reversal" | "pro_rata_fee" | "non_refundable"

  // non_refundable : commission méritée même en annulation — PAS de débit wallet.
  // On insère uniquement une ligne de traçabilité à 0.00.
  if (treatment === "non_refundable") {
    await tx.insert(economicEntitlements).values({
      reservationId,
      partyType: "easy2book",
      partyId: null,
      role: "easy2book",
      qualification: "commission",
      amount: "0.00",
      currency: "TND",
      basis: `Reversement commission — annulation ${publicRef} (non_refundable — commission conservée)`,
      status: "pending",
      effectiveAt: new Date(),
      compensatesId: originalEntitlement.id,
      cancellationTreatment: "non_refundable",
    })
    return
  }

  // ── 4. Montant autorisé : source = entitlement d'origine ───────────────────
  // reservationFinancials.commissionAmount est un garde d'entrée rapide ;
  // le montant effectivement crédité au wallet est dans l'entitlement.
  if (treatment === "pro_rata_fee") {
    // TODO CANCEL-COMMISSION-POLICY-01 : calcul pro_rata non défini par Direction.
    // Fallback full_reversal jusqu'à décision explicite.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_PRO_RATA_FALLBACK",
        reservationId,
        ts: new Date().toISOString(),
      }),
    )
  }

  const amountToReverse = Math.abs(parseFloat(originalEntitlement.amount ?? "0"))
  if (amountToReverse <= 0) return

  const idempotencyKey = `commission-reversal:${reservationId}`

  // ── A. Débit wallet commission (SECURITY DEFINER, idempotent) ──────────────
  await tx.execute(sql`
    SELECT debit_platform_commission(
      ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
      ${reservationId}::uuid,
      ${amountToReverse}::numeric,
      ${"Reversement commission — annulation " + publicRef},
      ${idempotencyKey}
    )
  `)

  // ── B. Ligne compensatoire economic_entitlements ─────────────────────────
  await tx.insert(economicEntitlements).values({
    reservationId,
    partyType: "easy2book",
    partyId: null,
    role: "easy2book",
    qualification: "commission",
    amount: (-amountToReverse).toFixed(2),
    currency: "TND",
    basis: `Reversement commission — annulation ${publicRef} (${treatment})`,
    status: "pending",
    effectiveAt: new Date(),
    compensatesId: originalEntitlement.id,
    cancellationTreatment: treatment,
  })
}
