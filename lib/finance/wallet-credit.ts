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

import { eq, sql } from "drizzle-orm"
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

export interface ReverseRechargeOutcome {
  agencyId: string
  movementId: string
  amount: number
  newBalance: number
}

/**
 * Annule le crédit d'une recharge déjà `validated`, suite à un remboursement
 * PSP (webhook `refunded`) — seul appelant : app/api/payment/webhook/route.ts,
 * uniquement quand `pending.status === "validated"` (rien à annuler sinon,
 * la recharge n'ayant jamais été créditée). Même discipline que
 * `creditRechargeRequest` : verrou `FOR UPDATE`, écriture via
 * `set_agency_deposit_balance`, mouvement `partner_credit_movements` tracé
 * (type `debit`, montant négatif — un remboursement PSP retire des fonds du
 * wallet agence, à ne pas confondre avec le type `refund` qui désigne un
 * remboursement EN FAVEUR de l'agence).
 */
export async function reverseRechargeCredit(
  tx: DrizzleTransaction,
  request: RechargeRequestForCredit,
  opts: { description: string },
): Promise<ReverseRechargeOutcome> {
  const amount = parseFloat(request.amount)

  const [agency] = await tx
    .select({ depositBalance: agencies.depositBalance })
    .from(agencies)
    .where(eq(agencies.id, request.agencyId))
    .for("update")

  if (!agency) throw new Error("AGENCY_NOT_FOUND")

  const currentBalance = parseFloat(agency.depositBalance)
  const newBalance = currentBalance - amount

  await tx.execute(
    sql`SELECT set_agency_deposit_balance(${request.agencyId}::uuid, ${newBalance.toFixed(3)}::numeric)`,
  )

  const [movement] = await tx
    .insert(partnerCreditMovements)
    .values({
      agencyId: request.agencyId,
      movementType: "debit",
      amount: (-amount).toFixed(3),
      balanceAfter: newBalance.toFixed(3),
      reference: `REFUND-${request.id.slice(0, 8).toUpperCase()}`,
      description: opts.description,
      createdByUserId: null,
    })
    .returning({ id: partnerCreditMovements.id })

  await tx
    .update(walletRechargeRequests)
    .set({
      status: "rejected",
      rejectionReason: "Paiement remboursé par le PSP",
      reviewedByUserId: null,
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

  // Seul canal autorisé pour écrire `agencies.deposit_balance` — `agencies`
  // n'a pas de policy RLS UPDATE pour une session tenant normale, seulement
  // pour is_super_admin() (toujours vrai ici en pratique, mais on utilise le
  // même canal que debitPartnerCredit par cohérence et en défense en
  // profondeur : voir drizzle/manual/0020_agency_wallet_balance_write_gap.sql).
  await tx.execute(
    sql`SELECT set_agency_deposit_balance(${request.agencyId}::uuid, ${newBalance.toFixed(3)}::numeric)`,
  )

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
