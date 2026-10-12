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
 *   1. reservation_financials → garde rapide (commissionAmount ≤ 0 → no-op).
 *   2. economic_entitlements → preuve comptable initiale + politique d'annulation.
 *      Absent → no-op + warn (pas de trace comptable du crédit initial).
 *   3. Politique :
 *      - non_refundable → ZÉRO débit wallet, insertion traçabilité 0.00 uniquement.
 *      - pro_rata_fee   → REJECT explicite (Direction n'a pas défini la règle).
 *      - full_reversal  → continuer.
 *   4. wallet_ledger → vérification que le crédit a bien eu lieu + montant réel crédité.
 *      Absent → no-op + warn (commission jamais créditée au wallet).
 *   5. amountToReverse = creditEntry.amount (écriture réelle), jamais le montant
 *      de l'entitlement ni de reservation_financials — on ne rembourse que ce qui
 *      a été effectivement crédité.
 *   6. debit_platform_commission() + INSERT compensatoire.
 *
 * DÉCISION COMMERCIALE REQUISE (TODO CANCEL-COMMISSION-POLICY-01) :
 *   Direction doit valider full_reversal / pro_rata_fee / non_refundable par
 *   produit/module avant déploiement de ces variantes.
 */

import { and, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { economicEntitlements, reservationFinancials, walletLedger } from "@/lib/db/schema"
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

  // ── 2. Entitlement d'origine — preuve comptable + politique ───────────────
  // Sans entitlement on ne peut pas connaître la politique ni vérifier que
  // la commission a bien été comptabilisée. On s'abstient (conservateur).
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

  if (!originalEntitlement) {
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

  if (treatment === "non_refundable") {
    // Commission méritée même en annulation : PAS de débit wallet.
    // Insertion traçabilité uniquement (amount=0.00).
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

  if (treatment === "pro_rata_fee") {
    // REJECT : Direction n'a pas défini ni validé le calcul pro_rata.
    // On ne choisit pas automatiquement une politique financière non validée.
    // Lever une exception force une investigation manuelle.
    throw new Error(
      `COMMISSION_REVERSAL_PRO_RATA_NOT_VALIDATED: reservationId=${reservationId} — ` +
        `Direction doit définir et valider la règle pro_rata_fee avant déploiement ` +
        `(TODO CANCEL-COMMISSION-POLICY-01).`,
    )
  }

  // ── 4. Vérification du crédit réel dans wallet_ledger ─────────────────────
  // Source authoritative du montant : l'écriture réelle dans wallet_ledger
  // (type='commission', category='commission', migration 0066).
  // On ne débite jamais plus que ce qui a été effectivement crédité.
  const [creditEntry] = await tx
    .select({ amount: walletLedger.amount })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        eq(walletLedger.reservationId, reservationId),
        eq(walletLedger.type, "commission"),
        eq(walletLedger.category, "commission"),
      ),
    )
    .limit(1)

  if (!creditEntry) {
    // Entitlement présent mais aucun crédit wallet correspondant : incohérence
    // à investiguer. On ne débite pas aveuglément.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_NO_LEDGER_CREDIT",
        reservationId,
        entitlementId: originalEntitlement.id,
        ts: new Date().toISOString(),
      }),
    )
    return
  }

  // ── 5. Montant = crédit wallet réel ───────────────────────────────────────
  const amountToReverse = parseFloat(creditEntry.amount ?? "0")
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
