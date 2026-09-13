/**
 * Customer Wallet — solde client final (B2C), Wallet/Payment Core.
 *
 * Réactive `wallet_accounts`/`wallet_ledger` (`lib/db/schema/financials.ts`)
 * — présentes dans le schéma mais écrites par AUCUN flux réel avant cette
 * migration (confirmé par grep sur tout le dépôt) — pour le seul nouveau
 * besoin : un solde CLIENT persistant, séparé du solde AGENCE réel
 * (`agencies.deposit_balance` + `partner_credit_movements`, utilisé par
 * `lib/pro/booking-actions.ts::debitPartnerCredit`, jamais touché ici).
 * Mêmes garanties transactionnelles (verrou `SELECT ... FOR UPDATE`,
 * idempotence Redis optionnelle) que `debitPartnerCredit`, mirées ici pour
 * un propriétaire `customerId` au lieu de `agencyId` — pas une réécriture
 * du moteur B2B, un second propriétaire sur le même mécanisme éprouvé.
 *
 * RLS — défaut trouvé et corrigé en Phase 14.3 (validation live contre une
 * vraie DB Postgres, jamais détectable par les tests unitaires à DB mockée
 * de la phase précédente) : `wallet_accounts_tenant_isolation`
 * (`agency_id = current_agency_id() OR is_super_admin()`) ne laisse passer
 * une ligne `agency_id IS NULL` (client) que sous `is_super_admin()` — or
 * les DEUX appelants réels (`guest-actions.ts::runCreateGuestReservation`
 * pour le débit, `refund-actions.ts::refundReservation` pour un staff non
 * super_admin comme `agent_compta`) passent leur transaction via
 * `txOverride` avec `isSuperAdmin: false` (à raison : le reste de LEUR
 * transaction — réservation, paiement, audit — reste correctement scopé à
 * l'agence). Sans correctif, tout débit/crédit wallet client échouait
 * silencieusement en environnement RLS réel (`app_runtime`, non-BYPASSRLS)
 * — confirmé en reproduisant l'INSERT en direct contre Postgres. Ce module
 * élève donc lui-même `app.is_super_admin` à `true` (portée `LOCAL`, donc
 * limitée à LA transaction en cours, jamais un privilège durable) juste
 * avant ses propres écritures — jamais délégué à l'appelant. Les
 * instructions déjà exécutées avant cet appel dans la transaction parente
 * (ex. l'INSERT `reservations` dans guest-actions.ts) ont déjà été évaluées
 * sous le contexte scopé-agence d'origine ; celles qui suivent (mise à jour
 * du statut, INSERT `payments`/`auditEvents`) filtrent déjà explicitement
 * par `agencyId` en dur, donc rester élevé pour le reste de ces
 * transactions précises et déjà entièrement validées côté serveur ne leur
 * ouvre aucun accès cross-agence réel.
 *
 * MODÈLE DE RÈGLEMENT (révisé) : un paiement n'est jamais un règlement
 * direct de la réservation — c'est d'abord une recharge du wallet du client
 * (quelle que soit la méthode : carte/Paymee en ligne, espèces, virement,
 * dépôt bancaire), et la réservation consomme ensuite ce wallet par un
 * débit de même montant. `recordTargetedWalletSettlement` (plus bas) est le
 * point d'entrée unique pour ce couple crédit+débit "ciblé" (une recharge
 * immédiatement consommée par LA réservation qui l'a déclenchée) — appelé
 * par les deux points de confirmation partagés par tous les modules B2C :
 * `lib/payment/reservation-webhook-core.ts` (carte/Paymee, automatique) et
 * `lib/finance/manual-payment-actions.ts::verifyManualPayment`
 * (espèces/virement/dépôt bancaire, validation staff). `debitCustomerWallet`
 * reste utilisé seul (sans crédit préalable) UNIQUEMENT pour "Solde
 * Easy2Book" (CUSTOMER_WALLET) — le client dépense un solde qu'il a DÉJÀ,
 * pas une recharge liée à cette réservation précise. `creditCustomerWallet`
 * reste utilisé seul pour un remboursement authentique (`source: "refund"`)
 * ou un crédit direct Master Admin (`source: "adjustment"`,
 * `lib/admin/customer-wallet-actions.ts`) — un crédit qui laisse un solde
 * réellement disponible pour un usage futur, contrairement au crédit+débit
 * ciblé qui nette à zéro pour CE règlement précis.
 */

import { eq, and, isNull, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import { getRedis } from "@/lib/cache/redis"
import { walletAccounts, walletLedger, type NewWalletLedger } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Types — mêmes formes que lib/pro/booking-actions.ts, testables sans I/O    */
/* -------------------------------------------------------------------------- */

export type DrizzleLikeDb = {
  transaction: <T>(callback: (tx: DrizzleLikeTx) => Promise<T>) => Promise<T>
}

export type DrizzleLikeTx = {
  select: (...args: unknown[]) => DrizzleLikeChain
  insert: (...args: unknown[]) => DrizzleLikeChain
  update: (...args: unknown[]) => DrizzleLikeChain
  /** Pour élever `app.is_super_admin` (portée LOCAL) avant l'écriture wallet — voir garde RLS en tête de fichier. */
  execute: (query: unknown) => Promise<unknown>
}

export type DrizzleLikeChain = {
  from?: (...args: unknown[]) => DrizzleLikeChain
  where?: (...args: unknown[]) => DrizzleLikeChain
  for?: (
    strength: "update" | "share" | "no key update" | "key share",
    config?: unknown,
  ) => Promise<unknown[]>
  values?: (...args: unknown[]) => DrizzleLikeChain
  set?: (...args: unknown[]) => DrizzleLikeChain
  returning?: (...args: unknown[]) => Promise<unknown[]>
}

/** Formate un montant TND en `numeric(14,2)` string canonique. */
export function formatTnd(value: number): string {
  return value.toFixed(2)
}

export function parseTnd(value: string | number): number {
  if (typeof value === "number") return value
  return Number.parseFloat(value)
}

/** Montant valide pour un débit/crédit : positif, fini, ≥ 1 centime. */
export function isValidWalletAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false
  if (amount <= 0) return false
  if (amount < 0.01) return false
  return true
}

export type DebitCustomerWalletInput = {
  customerId: string
  /** Toujours positif — le signe est appliqué avant insertion. */
  amountTnd: number
  reservationId?: string
  description: string
  idempotencyKey?: string
  redisOverride?: {
    get: <T>(key: string) => Promise<T | null>
    set: (key: string, value: string, opts?: { ex: number }) => Promise<unknown>
  }
  dbOverride?: DrizzleLikeDb
  /** Transaction parente (ex. création de réservation) — atomicité. */
  txOverride?: DrizzleLikeTx
}

/**
 * Taxonomie unifiée des méthodes de règlement B2C — un paiement recharge
 * TOUJOURS le wallet client par l'une de ces méthodes, quelle que soit la
 * politique de validation (automatique pour ONLINE_CARD, staff pour les 3
 * autres). N'inclut pas CUSTOMER_WALLET (pas de recharge : le client dépense
 * un solde déjà disponible) ni PARTNER_GUARANTEE (mécanisme B2B distinct —
 * `agencies.deposit_balance`/`partner_credit_movements`, jamais ce module).
 */
export type WalletRechargeMethod = "online_card" | "cash" | "bank_transfer" | "bank_deposit"

export type CreditCustomerWalletInput = {
  customerId: string
  amountTnd: number
  reservationId?: string
  paymentId?: string
  description: string
  /**
   * Traçabilité de la source du crédit :
   *  - une des 4 méthodes de `WalletRechargeMethod` : recharge ciblée,
   *    toujours suivie d'un débit de même montant dans la même transaction
   *    (voir `recordTargetedWalletSettlement`) — jamais appelée seule pour
   *    ce cas.
   *  - "refund" : remboursement authentique d'une réservation/paiement
   *    d'origine (lib/finance/refund-logic.ts) — solde réellement disponible.
   *  - "adjustment" : crédit direct Master Admin, sans paiement réel
   *    (lib/admin/customer-wallet-actions.ts) — solde réellement disponible.
   */
  source: WalletRechargeMethod | "refund" | "adjustment"
  dbOverride?: DrizzleLikeDb
  txOverride?: DrizzleLikeTx
}

export type WalletMovementSuccess = {
  ok: true
  walletAccountId: string
  ledgerId: string
  balanceBefore: string
  balanceAfter: string
}

export type WalletMovementFailure = {
  ok: false
  code: "INVALID_AMOUNT" | "INSUFFICIENT_FUNDS" | "DATABASE_NOT_CONFIGURED" | "INTERNAL_ERROR"
  message: string
  details?: Record<string, string | number>
}

export type WalletMovementResult = WalletMovementSuccess | WalletMovementFailure

/**
 * Résout (ou crée, verrouillée) la ligne `wallet_accounts` d'un client.
 * `type: "credit"` — seul type utilisé côté client (pas de découvert/escrow
 * pour un client final, contrairement au B2B qui distingue credit/debit/
 * escrow/commission).
 */
async function lockOrCreateCustomerWallet(
  tx: DrizzleLikeTx,
  customerId: string,
): Promise<{ id: string; currentBalance: string }> {
  // Portée LOCAL (voir garde RLS en tête de fichier) : élève le contexte
  // pour CETTE transaction uniquement, jamais un privilège durable — sans
  // ça, l'INSERT/SELECT ci-dessous échoue sous RLS réelle dès que
  // l'appelant (guest-actions.ts, refund-actions.ts) n'est pas déjà
  // super_admin, ce qui est le cas normal pour une transaction B2C/staff
  // scopée à une agence.
  await tx.execute(sql`select set_config('app.is_super_admin', 'true', true)`)

  const selectChain = tx
    .select({ id: walletAccounts.id, currentBalance: walletAccounts.currentBalance })
    .from?.(walletAccounts)
    .where?.(and(eq(walletAccounts.customerId, customerId), eq(walletAccounts.type, "credit")))
  const locked = (await selectChain?.for?.("update")) as
    | Array<{ id: string; currentBalance: string }>
    | undefined

  if (locked?.[0]) return locked[0]

  const inserted = (await tx
    .insert(walletAccounts)
    .values?.({
      customerId,
      type: "credit",
      currentBalance: "0",
      name: "Solde client",
    })
    .returning?.({ id: walletAccounts.id, currentBalance: walletAccounts.currentBalance })) as
    | Array<{ id: string; currentBalance: string }>
    | undefined

  if (!inserted?.[0]) {
    throw new Error("La création du compte wallet client n'a pas retourné d'id.")
  }
  return inserted[0]
}

/**
 * Débite le solde client — utilisé UNIQUEMENT quand un client choisit
 * "wallet" comme mode de paiement et dispose d'un solde suffisant
 * (crédité au préalable par un remboursement, jamais par ce débit
 * lui-même). Ne crée jamais de solde négatif : pas de découvert client.
 */
export async function debitCustomerWallet(
  input: DebitCustomerWalletInput,
): Promise<WalletMovementResult> {
  if (!isValidWalletAmount(input.amountTnd)) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Le montant à débiter doit être strictement positif (centime minimum 0.01 DT).",
    }
  }
  if (!process.env.DATABASE_URL && !input.dbOverride && !input.txOverride) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "Base de données non configurée." }
  }

  const run = async (tx: DrizzleLikeTx): Promise<WalletMovementResult> => {
    const wallet = await lockOrCreateCustomerWallet(tx, input.customerId)
    const balanceBefore = parseTnd(wallet.currentBalance)

    if (balanceBefore < input.amountTnd) {
      return {
        ok: false,
        code: "INSUFFICIENT_FUNDS",
        message: `Solde insuffisant : disponible ${formatTnd(balanceBefore)} DT, demandé ${formatTnd(input.amountTnd)} DT.`,
        details: { availableTnd: formatTnd(balanceBefore), requestedTnd: formatTnd(input.amountTnd) },
      }
    }

    const balanceAfter = balanceBefore - input.amountTnd
    const ledgerInsert: NewWalletLedger = {
      walletAccountId: wallet.id,
      type: "debit",
      status: "completed",
      amount: formatTnd(input.amountTnd),
      balanceBefore: formatTnd(balanceBefore),
      balanceAfter: formatTnd(balanceAfter),
      description: input.description,
      reservationId: input.reservationId,
      category: "booking",
    }
    const inserted = (await tx
      .insert(walletLedger)
      .values?.(ledgerInsert)
      .returning?.({ id: walletLedger.id })) as Array<{ id: string }> | undefined
    const ledgerId = inserted?.[0]?.id
    if (!ledgerId) throw new Error("L'insertion du mouvement de débit n'a pas retourné d'id.")

    await tx
      .update(walletAccounts)
      .set?.({ currentBalance: formatTnd(balanceAfter), updatedAt: new Date() })
      .where?.(eq(walletAccounts.id, wallet.id))

    const success: WalletMovementSuccess = {
      ok: true,
      walletAccountId: wallet.id,
      ledgerId,
      balanceBefore: formatTnd(balanceBefore),
      balanceAfter: formatTnd(balanceAfter),
    }

    if (input.idempotencyKey) {
      const redis = input.redisOverride ?? getRedis()
      if (redis) {
        await redis.set(`e2b:idem:customer-wallet-debit:${input.idempotencyKey}`, JSON.stringify(success), {
          ex: 86_400,
        })
      }
    }
    return success
  }

  try {
    if (input.idempotencyKey && !input.txOverride) {
      const redis = input.redisOverride ?? getRedis()
      if (redis) {
        const cached = await redis.get<string>(`e2b:idem:customer-wallet-debit:${input.idempotencyKey}`)
        if (cached) {
          try {
            return JSON.parse(cached) as WalletMovementResult
          } catch {
            /* cache corrompu — on rejoue normalement */
          }
        }
      }
    }
    if (input.txOverride) return await run(input.txOverride)
    const db = (input.dbOverride ?? getDb()) as DrizzleLikeDb
    return await db.transaction(run)
  } catch (err) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? `Échec transactionnel : ${err.message}` : "Échec transactionnel inattendu.",
    }
  }
}

/**
 * Crédite le solde client — remboursement authentique uniquement
 * (`source: "refund"`), lié à la réservation/paiement d'origine. Jamais
 * appelé pour simuler un règlement carte/espèces/virement (voir garde en
 * tête de fichier).
 */
export async function creditCustomerWallet(
  input: CreditCustomerWalletInput,
): Promise<WalletMovementResult> {
  if (!isValidWalletAmount(input.amountTnd)) {
    return {
      ok: false,
      code: "INVALID_AMOUNT",
      message: "Le montant à créditer doit être strictement positif (centime minimum 0.01 DT).",
    }
  }
  if (!process.env.DATABASE_URL && !input.dbOverride && !input.txOverride) {
    return { ok: false, code: "DATABASE_NOT_CONFIGURED", message: "Base de données non configurée." }
  }

  const run = async (tx: DrizzleLikeTx): Promise<WalletMovementResult> => {
    const wallet = await lockOrCreateCustomerWallet(tx, input.customerId)
    const balanceBefore = parseTnd(wallet.currentBalance)
    const balanceAfter = balanceBefore + input.amountTnd

    const ledgerInsert: NewWalletLedger = {
      walletAccountId: wallet.id,
      type: "credit",
      status: "completed",
      amount: formatTnd(input.amountTnd),
      balanceBefore: formatTnd(balanceBefore),
      balanceAfter: formatTnd(balanceAfter),
      description: input.description,
      reservationId: input.reservationId,
      paymentId: input.paymentId,
      category: input.source === "refund" ? "refund" : input.source === "adjustment" ? "adjustment" : "recharge",
      metadata: { paymentMethod: input.source },
    }
    const inserted = (await tx
      .insert(walletLedger)
      .values?.(ledgerInsert)
      .returning?.({ id: walletLedger.id })) as Array<{ id: string }> | undefined
    const ledgerId = inserted?.[0]?.id
    if (!ledgerId) throw new Error("L'insertion du mouvement de crédit n'a pas retourné d'id.")

    await tx
      .update(walletAccounts)
      .set?.({ currentBalance: formatTnd(balanceAfter), updatedAt: new Date() })
      .where?.(eq(walletAccounts.id, wallet.id))

    return {
      ok: true,
      walletAccountId: wallet.id,
      ledgerId,
      balanceBefore: formatTnd(balanceBefore),
      balanceAfter: formatTnd(balanceAfter),
    }
  }

  try {
    if (input.txOverride) return await run(input.txOverride)
    const db = (input.dbOverride ?? getDb()) as DrizzleLikeDb
    return await db.transaction(run)
  } catch (err) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? `Échec transactionnel : ${err.message}` : "Échec transactionnel inattendu.",
    }
  }
}

export type RecordTargetedWalletSettlementInput = {
  customerId: string
  /** Montant réellement encaissé POUR CETTE tentative — jamais le total de
   * la réservation (une réservation peut recevoir plusieurs tentatives
   * partielles, voir lib/finance/manual-payment-actions.ts). */
  amountTnd: number
  reservationId: string
  paymentId?: string
  method: WalletRechargeMethod
  /** Référence lisible pour la description du mouvement (ex. publicRef). */
  reference: string
  /** Transaction PARENTE déjà ouverte (webhook ou verifyManualPayment) —
   * toujours requis : ce couple crédit+débit n'a de sens que DANS la même
   * transaction que la capture qui le déclenche, jamais en isolation. */
  txOverride: DrizzleLikeTx
}

/**
 * Point d'entrée unique pour "un paiement recharge le wallet, la réservation
 * le consomme aussitôt" — crédite puis débite le MÊME montant, dans la MÊME
 * transaction, pour les 4 méthodes de `WalletRechargeMethod`. Le solde
 * client nette à zéro pour ce règlement précis (comportement voulu : c'est
 * une recharge CIBLÉE à cette réservation, pas un solde libre comme
 * CUSTOMER_WALLET) — mais chaque règlement, quelle que soit sa méthode,
 * laisse désormais une trace crédit+débit auditable dans `wallet_ledger`,
 * au lieu d'un règlement direct invisible du wallet.
 *
 * Le débit ne peut jamais échouer pour "solde insuffisant" ici : on vient
 * de créditer exactement ce montant dans la même transaction. S'il échoue
 * quand même (erreur DB inattendue), l'appelant doit laisser l'exception
 * remonter pour ROLLBACK toute la transaction — jamais un crédit sans son
 * débit correspondant.
 */
export async function recordTargetedWalletSettlement(
  input: RecordTargetedWalletSettlementInput,
): Promise<WalletMovementResult> {
  const credit = await creditCustomerWallet({
    customerId: input.customerId,
    amountTnd: input.amountTnd,
    reservationId: input.reservationId,
    paymentId: input.paymentId,
    description: `Recharge ${input.method} — réservation ${input.reference}`,
    source: input.method,
    txOverride: input.txOverride,
  })
  if (!credit.ok) return credit

  const debit = await debitCustomerWallet({
    customerId: input.customerId,
    amountTnd: input.amountTnd,
    reservationId: input.reservationId,
    description: `Règlement ${input.method} — réservation ${input.reference}`,
    txOverride: input.txOverride,
  })
  if (!debit.ok) {
    throw new Error(
      `INCOHÉRENCE WALLET : crédit ${input.method} réussi (ledger ${credit.ledgerId}) mais débit immédiat échoué (${debit.code}: ${debit.message}) — réservation ${input.reservationId}. Transaction annulée.`,
    )
  }
  return debit
}

/**
 * Solde client courant — 0 si aucun compte wallet n'existe encore (jamais
 * crédité). Passe par `withSystemContext` — même garde RLS que l'écriture
 * (voir tête de fichier) : une lecture directe via `getDb()` sans contexte
 * élevé est bloquée par `wallet_accounts_tenant_isolation` pour toute ligne
 * `agency_id IS NULL`, et renvoyait silencieusement 0 même avec un solde
 * réel non nul (trouvé en Phase 14.3, live contre une vraie DB Postgres).
 */
export async function getCustomerWalletBalance(customerId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0
  const [wallet] = await withSystemContext((tx) =>
    tx
      .select({ currentBalance: walletAccounts.currentBalance })
      .from(walletAccounts)
      .where(and(eq(walletAccounts.customerId, customerId), eq(walletAccounts.type, "credit"), isNull(walletAccounts.agencyId)))
      .limit(1),
  )
  return wallet ? parseTnd(wallet.currentBalance) : 0
}
