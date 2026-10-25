/**
 * Cœur transactionnel du webhook PSP de recharge wallet B2C client.
 * Chaîné après `processWalletWebhookCore` quand celui-ci retourne `no_match`
 * (aucune demande B2B correspondante trouvée).
 *
 * Mêmes garanties que son homologue B2B :
 *  P0-A : corrélation AVANT consommation de l'eventId
 *  P0-B : vérification identité PSP AVANT consommation de l'eventId
 *
 * Invariant financier respecté : `creditCustomerWallet` est appelé avec
 * `source: "online_card"` et `idempotencyKey = topup_request.id` —
 * wallet_ledger n'est JAMAIS UPDATE, seulement INSERT (append-only).
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  customerTopupRequests,
  paymentEvents,
  pspWebhooks,
} from "@/lib/db/schema"
import {
  creditCustomerWallet,
  type WalletMovementSuccess,
} from "@/lib/finance/customer-wallet"
import {
  classifyEventType,
  type NormalizedChargeEvent,
} from "@/lib/payment/webhook-logic"

export type CustomerTopupWebhookOutcome =
  | { status: "ignored" }
  | { status: "no_match" }
  | { status: "duplicate" }
  | { status: "already_processed" }
  | { status: "payment_failed"; customerId: string }
  | { status: "mismatch"; reason: string }
  | {
      status: "credited"
      customerId: string
      agencyId: string
      txId: string
      amount: number
      newBalance: number
    }

export interface ProcessCustomerTopupWebhookInput {
  provider: "stripe" | "sps" | "paymee"
  eventId: string
  eventType: string
  charge: NormalizedChargeEvent | null
  signatureOk: boolean
  auditPayload: Record<string, unknown>
}

export async function processCustomerTopupWebhookCore(
  tx: DrizzleTransaction,
  input: ProcessCustomerTopupWebhookInput,
): Promise<CustomerTopupWebhookOutcome> {
  const { provider, eventId, eventType, charge, signatureOk, auditPayload } =
    input

  const kind = classifyEventType(eventType)

  if (kind === "unknown" || !charge) {
    return { status: "ignored" }
  }

  // P0-A : corrélation AVANT consommation de l'eventId
  const [pending] = await tx
    .select()
    .from(customerTopupRequests)
    .where(eq(customerTopupRequests.paymentReference, charge.providerRef))
    .for("update")

  if (!pending) {
    return { status: "no_match" }
  }

  // WALLET-B2C-RECHARGE-METHODS-01 : seule une recharge explicitement par
  // carte, avec un PSP déclaré, peut être créditée par un webhook. Une
  // demande manuelle (virement, versement, espèces, D17 — psp NULL) ne se
  // crédite qu'après validation humaine (customer-topup-manual-core.ts).
  if (pending.method !== "card" || pending.psp === null) {
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `NOT_CARD_TOPUP:method=${pending.method}`,
    })
    return { status: "no_match" }
  }

  // P0-B : vérification identité PSP
  if (pending.psp !== provider) {
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `PSP_MISMATCH:expected=${pending.psp}`,
    })
    return { status: "no_match" }
  }

  // Idempotence event-level
  const inserted = await tx
    .insert(paymentEvents)
    .values({ eventId, provider, eventType })
    .onConflictDoNothing()
    .returning({ eventId: paymentEvents.eventId })

  if (inserted.length === 0) {
    return { status: "duplicate" }
  }

  if (pending.status !== "pending") {
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `ALREADY_PROCESSED:${pending.status}`,
    })
    return { status: "already_processed" }
  }

  if (kind === "failed") {
    await tx
      .update(customerTopupRequests)
      .set({ status: "failed" })
      .where(eq(customerTopupRequests.id, pending.id))

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
    })
    return { status: "payment_failed", customerId: pending.customerId }
  }

  // kind === "succeeded" : vérification montant
  const expectedAmount = parseFloat(String(pending.amount))
  const amountTnd = charge.amountTnd
  if (
    !Number.isFinite(expectedAmount) ||
    !Number.isFinite(amountTnd) ||
    Math.abs(expectedAmount - amountTnd) > 0.001
  ) {
    const reason = "AMOUNT_MISMATCH"
    await tx
      .update(customerTopupRequests)
      .set({ status: "failed" })
      .where(eq(customerTopupRequests.id, pending.id))

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: reason,
    })
    return { status: "mismatch", reason }
  }

  // Crédit wallet — append-only (wallet_ledger jamais UPDATE)
  const creditResult = await creditCustomerWallet({
    customerId: pending.customerId,
    amountTnd,
    source: "online_card",
    idempotencyKey: pending.id,
    description: `Recharge wallet Easy2Book — ${provider.toUpperCase()} (réf. ${charge.providerRef})`,
  })

  if (!creditResult.ok) {
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `CREDIT_FAILED:${creditResult.code}`,
    })
    return { status: "mismatch", reason: `CREDIT_FAILED:${creditResult.code}` }
  }

  const success = creditResult as WalletMovementSuccess
  const newBalance = parseFloat(success.balanceAfter)

  await tx
    .update(customerTopupRequests)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(customerTopupRequests.id, pending.id))

  await tx.insert(pspWebhooks).values({
    agencyId: pending.agencyId,
    psp: provider,
    eventType,
    payload: auditPayload,
    signatureOk,
    processedAt: new Date(),
  })

  return {
    status: "credited",
    customerId: pending.customerId,
    agencyId: pending.agencyId,
    txId: success.ledgerId,
    amount: amountTnd,
    newBalance,
  }
}
