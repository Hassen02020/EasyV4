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
 * Accès exclusivement via `withSystemContext` (rôle service, bypass RLS) :
 * un client final B2C n'a aujourd'hui aucune session Supabase Auth (voir
 * lib/booking/guest-actions.ts), donc aucune policy RLS tenant-scoped ne
 * peut légitimement s'appliquer à ces lignes — `wallet_accounts_tenant_isolation`
 * (`agency_id = current_agency_id() OR is_super_admin()`) ne laisse déjà
 * passer une ligne `agency_id IS NULL` que sous `is_super_admin()`, donc ce
 * module ne doit JAMAIS être appelé sous un contexte tenant partenaire.
 *
 * IMPORTANT (Wallet/Payment Core, garde explicite) : ce module ne doit
 * JAMAIS être utilisé pour simuler un règlement carte ou espèces/virement
 * via un aller-retour crédit-puis-débit artificiel. Il sert exactement
 * deux cas réels : (1) débiter un solde client PRÉ-EXISTANT au moment
 * d'une réservation ("wallet" comme mode de paiement), (2) créditer un
 * remboursement authentique lié à une réservation/paiement d'origine. Le
 * règlement carte/espèces/virement passe par `payments` +
 * `auditEvents` (voir lib/finance/manual-payment-actions.ts et
 * lib/booking/guest-actions.ts) — jamais par ce module.
 */

import { eq, and, isNull } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
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

export type CreditCustomerWalletInput = {
  customerId: string
  amountTnd: number
  reservationId?: string
  paymentId?: string
  description: string
  /** Traçabilité de la source du crédit — jamais "recharge" pour un client B2C (pas de flux de rechargement) : "refund" (remboursement) est le seul cas réel aujourd'hui. */
  source: "refund" | "adjustment"
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

/** Solde client courant — 0 si aucun compte wallet n'existe encore (jamais crédité). */
export async function getCustomerWalletBalance(customerId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0
  const db = getDb()
  const [wallet] = await db
    .select({ currentBalance: walletAccounts.currentBalance })
    .from(walletAccounts)
    .where(and(eq(walletAccounts.customerId, customerId), eq(walletAccounts.type, "credit"), isNull(walletAccounts.agencyId)))
    .limit(1)
  return wallet ? parseTnd(wallet.currentBalance) : 0
}
