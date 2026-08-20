/**
 * Core partagé — comment une demande de recharge PENDING devient un solde
 * agence crédité + un mouvement de ledger.
 *
 * Deux appelants confiés (aucun autre ne doit écrire directement dans
 * `agencies.deposit_balance` pour une recharge) :
 *  - `validateRechargeRequest` (lib/finance/recharge-actions.ts) : approbation
 *    manuelle par un super_admin (virement, espèces, chèque, mandat…).
 *  - le webhook PSP (app/api/payment/webhook/route.ts) : confirmation
 *    automatique d'un paiement en ligne (carte), après vérification stricte
 *    de signature + montant + devise côté webhook.
 *
 * L'appelant est responsable de :
 *  - verrouiller la ligne `wallet_recharge_requests` (`FOR UPDATE`) et
 *    vérifier `status === 'pending'` AVANT d'appeler cette fonction ;
 *  - exécuter dans une transaction (`tx`) déjà ouverte avec le bon contexte
 *    RLS (tenant ou système).
 */

import { eq } from "drizzle-orm"
import { agencies, walletRechargeRequests, partnerCreditMovements } from "@/lib/db/schema"
import type { DrizzleTransaction } from "@/lib/db/client"

export interface RechargeRequestForCredit {
  id: string
  agencyId: string
  amount: string
}

export interface CreditRechargeOutcome {
  agencyId: string
  movementId: string
  amount: number
  newBalance: number
}

export async function creditRechargeRequest(
  tx: DrizzleTransaction,
  request: RechargeRequestForCredit,
  opts: { reviewedByUserId: string | null; description: string },
): Promise<CreditRechargeOutcome> {
  const amount = parseFloat(request.amount)

  // Solde relu et verrouillé (`FOR UPDATE`) DANS la transaction — même
  // protection contre une double-crédit concurrente que validateRechargeRequest.
  const [agency] = await tx
    .select({ depositBalance: agencies.depositBalance })
    .from(agencies)
    .where(eq(agencies.id, request.agencyId))
    .for("update")

  if (!agency) throw new Error("AGENCY_NOT_FOUND")

  const currentBalance = parseFloat(agency.depositBalance)
  const newBalance = currentBalance + amount

  await tx
    .update(agencies)
    .set({ depositBalance: newBalance.toFixed(3) })
    .where(eq(agencies.id, request.agencyId))

  const [movement] = await tx
    .insert(partnerCreditMovements)
    .values({
      agencyId: request.agencyId,
      movementType: "credit",
      amount: amount.toFixed(3),
      balanceAfter: newBalance.toFixed(3),
      reference: `RECHARGE-${request.id.slice(0, 8).toUpperCase()}`,
      description: opts.description,
      createdByUserId: opts.reviewedByUserId,
    })
    .returning({ id: partnerCreditMovements.id })

  await tx
    .update(walletRechargeRequests)
    .set({
      status: "validated",
      reviewedByUserId: opts.reviewedByUserId,
      reviewedAt: new Date(),
    })
    .where(eq(walletRechargeRequests.id, request.id))

  return {
    agencyId: request.agencyId,
    movementId: movement.id,
    amount,
    newBalance,
  }
}
