"use server"

/**
 * Wallet Server Actions — Easy2Book
 *
 * Toutes les mutations de solde passent par des transactions SQL atomiques
 * (db.transaction) pour éviter les double-débits et l'argent fantôme.
 *
 * Flux :
 *  1. Débit réservation  → walletDebitReservation()
 *  2. Demande de recharge → requestWalletTopUp()   (PENDING)
 *  3. Validation admin    → validateTopUp()         (VALIDATED → balance++)
 *  4. Rejet admin         → rejectTopUp()           (REJECTED)
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createClient } from "@supabase/supabase-js"
import { getDb } from "@/lib/db/client"
import { inngest } from "@/lib/inngest/client"
import type * as schema from "@/lib/db/schema"
import {
  wallets,
  walletTransactions,
  reservations,
  auditEvents,
  payments,
  type WalletTopUpMethod,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Types publics                                                               */
/* -------------------------------------------------------------------------- */

export type WalletActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

/* -------------------------------------------------------------------------- */
/* Helpers internes                                                            */
/* -------------------------------------------------------------------------- */

type Db = PostgresJsDatabase<typeof schema>

/** Récupère (ou crée) le wallet d'une agence. */
async function getOrCreateWallet(db: Db, agencyId: string) {
  const existing = await db
    .select()
    .from(wallets)
    .where(eq(wallets.agencyId, agencyId))
    .limit(1)

  if (existing[0]) return existing[0]

  const created = await db
    .insert(wallets)
    .values({ agencyId, balance: "0.000", currency: "TND" })
    .returning()
  return created[0]
}

/* -------------------------------------------------------------------------- */
/* 1. Débit wallet lors d'une réservation                                     */
/* -------------------------------------------------------------------------- */

export interface DebitWalletInput {
  agencyId: string
  reservationId: string
  amountTnd: number
  createdByUserId?: string
}

/**
 * Débite le wallet de l'agence pour une réservation.
 * Opération atomique : si balance insuffisante → rollback complet.
 */
export async function walletDebitReservation(
  input: DebitWalletInput,
): Promise<WalletActionResult<{ txId: string; newBalance: string }>> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }
  if (input.amountTnd <= 0)
    return { ok: false, error: "Montant invalide", code: "INVALID_AMOUNT" }

  const db = getDb()

  try {
    const result = await db.transaction(async (tx) => {
      /* --- Lock + lecture wallet --- */
      const walletRow = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.agencyId, input.agencyId))
        .limit(1)
        .for("update") // row-level lock

      if (!walletRow[0]) {
        throw new Error("WALLET_NOT_FOUND")
      }

      const balance = parseFloat(walletRow[0].balance)
      if (balance < input.amountTnd) {
        throw new Error("INSUFFICIENT_BALANCE")
      }

      const newBalance = (balance - input.amountTnd).toFixed(3)

      /* --- Mise à jour balance --- */
      await tx
        .update(wallets)
        .set({
          balance: newBalance,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, walletRow[0].id))

      /* --- Enregistrement transaction --- */
      const [txRow] = await tx
        .insert(walletTransactions)
        .values({
          walletId: walletRow[0].id,
          agencyId: input.agencyId,
          type: "DEBIT",
          amount: input.amountTnd.toFixed(3),
          status: "VALIDATED",
          reservationId: input.reservationId,
          createdByUserId: input.createdByUserId,
        })
        .returning({ id: walletTransactions.id })

      /* --- Passer réservation en CONFIRMED + log payment wallet --- */
      await tx
        .update(reservations)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, input.reservationId))

      await tx.insert(payments).values({
        agencyId: input.agencyId,
        reservationId: input.reservationId,
        psp: "manual",
        method: "wallet",
        originalCurrency: "TND",
        originalAmount: input.amountTnd.toFixed(2),
        tndAmount: input.amountTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      /* --- Audit --- */
      await tx.insert(auditEvents).values({
        agencyId: input.agencyId,
        actorUserId: input.createdByUserId,
        entityType: "wallet",
        entityId: walletRow[0].id,
        action: "wallet.debit",
        diff: {
          reservationId: input.reservationId,
          amount: input.amountTnd,
          balanceBefore: balance.toFixed(3),
          balanceAfter: newBalance,
        },
      })

      return { txId: txRow.id, newBalance }
    })

    return { ok: true, data: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === "INSUFFICIENT_BALANCE")
      return {
        ok: false,
        error: "Solde insuffisant pour confirmer cette réservation",
        code: "INSUFFICIENT_BALANCE",
      }
    if (msg === "WALLET_NOT_FOUND")
      return {
        ok: false,
        error: "Wallet introuvable pour cette agence",
        code: "WALLET_NOT_FOUND",
      }
    console.error("[walletDebitReservation]", err)
    return { ok: false, error: "Erreur interne", code: "INTERNAL_ERROR" }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Demande de rechargement (par l'agence)                                  */
/* -------------------------------------------------------------------------- */

export interface TopUpRequestInput {
  agencyId: string
  amount: number
  method: WalletTopUpMethod
  referenceNumber?: string
  /** File object encodé en base64 (max 5MB) ou null si Zitouna Pay */
  proofFileBase64?: string
  proofFileName?: string
  createdByUserId?: string
}

/**
 * Crée une demande de rechargement (statut PENDING).
 * Si un fichier reçu est fourni, l'upload vers Supabase Storage est effectué.
 * Pour ZITOUNA_PAY, déclenche l'initiation de paiement via le stub.
 */
export async function requestWalletTopUp(
  input: TopUpRequestInput,
): Promise<WalletActionResult<{ txId: string }>> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }
  if (input.amount <= 0)
    return { ok: false, error: "Montant invalide", code: "INVALID_AMOUNT" }
  if (input.amount > 500_000)
    return {
      ok: false,
      error: "Montant maximum : 500 000 DT par demande",
      code: "AMOUNT_TOO_LARGE",
    }

  const db = getDb()

  /* --- Upload reçu vers Supabase Storage si fourni --- */
  let proofUrl: string | null | undefined

  if (input.proofFileBase64 && input.proofFileName) {
    const uploaded = await uploadProofToStorage(
      input.agencyId,
      input.proofFileBase64,
      input.proofFileName,
    )
    if (!uploaded)
      return {
        ok: false,
        error: "Échec upload du reçu — réessayez",
        code: "UPLOAD_FAILED",
      }
  }

  /* --- Pour Zitouna Pay : initier la transaction gateway --- */
  let zitounaMetadata: Record<string, string> | undefined
  if (input.method === "ZITOUNA_PAY") {
    const zitounaResult = await initZitounaPay({
      agencyId: input.agencyId,
      amountTnd: input.amount,
    })
    if (!zitounaResult.ok)
      return { ok: false, error: zitounaResult.error, code: "ZITOUNA_ERROR" }
    zitounaMetadata = {
      zitounaOrderId: zitounaResult.orderId,
      zitounaPayUrl: zitounaResult.payUrl,
    }
  }

  /* --- Créer le wallet si inexistant --- */
  const wallet = await getOrCreateWallet(db, input.agencyId)

  /* --- Insérer la transaction PENDING --- */
  const [txRow] = await db
    .insert(walletTransactions)
    .values({
      walletId: wallet.id,
      agencyId: input.agencyId,
      type: "CREDIT",
      method: input.method,
      amount: input.amount.toFixed(3),
      referenceNumber: input.referenceNumber,
      proofUrl: proofUrl ?? undefined,
      status: input.method === "ZITOUNA_PAY" ? "PENDING" : "PENDING",
      metadata: zitounaMetadata ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning({ id: walletTransactions.id })

  /* --- Audit --- */
  await db.insert(auditEvents).values({
    agencyId: input.agencyId,
    actorUserId: input.createdByUserId,
    entityType: "wallet",
    entityId: wallet.id,
    action: "wallet.topup_requested",
    diff: {
      amount: input.amount,
      method: input.method,
      referenceNumber: input.referenceNumber,
      hasProof: !!proofUrl,
    },
  })

  return { ok: true, data: { txId: txRow.id } }
}

/* -------------------------------------------------------------------------- */
/* 3. Validation admin (PENDING → VALIDATED + crédit balance)                 */
/* -------------------------------------------------------------------------- */

export interface ValidateTopUpInput {
  txId: string
  adminUserId: string
  adminNote?: string
}

/**
 * Valide une demande de rechargement.
 * Opération atomique : incrémente balance + passe tx en VALIDATED.
 * Réservée aux rôles manager / super_admin / agent_compta.
 */
export async function validateTopUp(
  input: ValidateTopUpInput,
): Promise<WalletActionResult<{ newBalance: string }>> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }

  const db = getDb()

  try {
    const result = await db.transaction(async (tx) => {
      /* --- Récupérer et locker la transaction --- */
      const [txRow] = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, input.txId))
        .limit(1)
        .for("update")

      if (!txRow) throw new Error("TX_NOT_FOUND")
      if (txRow.status !== "PENDING") throw new Error("TX_NOT_PENDING")
      if (txRow.type !== "CREDIT" && txRow.type !== "ADJUSTMENT")
        throw new Error("TX_NOT_CREDITABLE")

      /* --- Locker et mettre à jour le wallet --- */
      const [walletRow] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, txRow.walletId))
        .limit(1)
        .for("update")

      if (!walletRow) throw new Error("WALLET_NOT_FOUND")

      const newBalance = (
        parseFloat(walletRow.balance) + parseFloat(txRow.amount)
      ).toFixed(3)

      await tx
        .update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, walletRow.id))

      /* --- Passer la tx en VALIDATED --- */
      await tx
        .update(walletTransactions)
        .set({
          status: "VALIDATED",
          validatedByUserId: input.adminUserId,
          validatedAt: new Date(),
          adminNote: input.adminNote,
        })
        .where(eq(walletTransactions.id, input.txId))

      /* --- Audit --- */
      await tx.insert(auditEvents).values({
        agencyId: txRow.agencyId,
        actorUserId: input.adminUserId,
        entityType: "wallet",
        entityId: walletRow.id,
        action: "wallet.topup_validated",
        diff: {
          txId: input.txId,
          amount: txRow.amount,
          balanceBefore: walletRow.balance,
          balanceAfter: newBalance,
          method: txRow.method,
          adminNote: input.adminNote,
        },
      })

      return { newBalance, agencyId: txRow.agencyId, amount: txRow.amount, method: txRow.method }
    })

    /* --- Émettre l'événement Inngest (arrière-plan) --- */
    inngest.send({
      name: "wallet/credited",
      data: {
        agencyId: result.agencyId,
        txId: input.txId,
        amount: parseFloat(result.amount),
        newBalance: parseFloat(result.newBalance),
        method: result.method ?? "CASH",
        adminUserId: input.adminUserId,
      },
    }).catch(() => { /* fire-and-forget */ })

    return { ok: true, data: { newBalance: result.newBalance } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      TX_NOT_FOUND: "Transaction introuvable",
      TX_NOT_PENDING: "Cette transaction n'est plus en attente",
      TX_NOT_CREDITABLE: "Type de transaction non validable",
      WALLET_NOT_FOUND: "Wallet introuvable",
    }
    return {
      ok: false,
      error: codes[msg] ?? "Erreur interne",
      code: msg,
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 4. Rejet admin                                                              */
/* -------------------------------------------------------------------------- */

export interface RejectTopUpInput {
  txId: string
  adminUserId: string
  adminNote: string
}

export async function rejectTopUp(
  input: RejectTopUpInput,
): Promise<WalletActionResult> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }

  const db = getDb()

  const [txRow] = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.id, input.txId))
    .limit(1)

  if (!txRow) return { ok: false, error: "Transaction introuvable", code: "TX_NOT_FOUND" }
  if (txRow.status !== "PENDING")
    return { ok: false, error: "Transaction non en attente", code: "TX_NOT_PENDING" }

  await db.transaction(async (tx) => {
    await tx
      .update(walletTransactions)
      .set({
        status: "REJECTED",
        validatedByUserId: input.adminUserId,
        validatedAt: new Date(),
        adminNote: input.adminNote,
      })
      .where(eq(walletTransactions.id, input.txId))

    await tx.insert(auditEvents).values({
      agencyId: txRow.agencyId,
      actorUserId: input.adminUserId,
      entityType: "wallet",
      entityId: txRow.walletId,
      action: "wallet.topup_rejected",
      diff: { txId: input.txId, reason: input.adminNote },
    })
  })

  return { ok: true, data: undefined }
}

/* -------------------------------------------------------------------------- */
/* 5. Getter — solde actuel                                                   */
/* -------------------------------------------------------------------------- */

export async function getWalletBalance(
  agencyId: string,
): Promise<WalletActionResult<{ balance: string; currency: string }>> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }

  const db = getDb()
  const wallet = await getOrCreateWallet(db, agencyId)
  return { ok: true, data: { balance: wallet.balance, currency: wallet.currency } }
}

/* -------------------------------------------------------------------------- */
/* Upload reçu vers Supabase Storage                                          */
/* -------------------------------------------------------------------------- */

async function uploadProofToStorage(
  agencyId: string,
  base64: string,
  fileName: string,
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error("[uploadProofToStorage] Supabase env vars manquantes")
    return null
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey)
    const buffer = Buffer.from(base64, "base64")
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg"
    const allowed = ["jpg", "jpeg", "png", "pdf", "webp"]
    if (!allowed.includes(ext)) {
      console.error("[uploadProofToStorage] Extension non autorisée:", ext)
      return null
    }
    if (buffer.byteLength > 5 * 1024 * 1024) {
      console.error("[uploadProofToStorage] Fichier trop grand (max 5MB)")
      return null
    }

    const path = `wallet-proofs/${agencyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from("agency-docs")
      .upload(path, buffer, {
        contentType: ext === "pdf" ? "application/pdf" : `image/${ext}`,
        upsert: false,
      })

    if (error) {
      console.error("[uploadProofToStorage]", error.message)
      return null
    }

    const { data } = supabase.storage.from("agency-docs").getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error("[uploadProofToStorage] Exception:", err)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Stub Zitouna Pay (Sprint 2 — à remplacer par l'API réelle)                */
/* -------------------------------------------------------------------------- */

interface ZitounaPayResult {
  ok: boolean
  orderId: string
  payUrl: string
  error: string
}

/**
 * Stub de l'API Zitouna Pay.
 *
 * En production (Sprint 2), remplacer par l'appel réel vers :
 *   POST https://api.zitounapay.tn/v1/orders
 *
 * Variables d'env requises :
 *   ZITOUNA_PAY_API_KEY
 *   ZITOUNA_PAY_MERCHANT_ID
 *   ZITOUNA_PAY_BASE_URL (défaut: https://api.zitounapay.tn/v1)
 *   NEXT_PUBLIC_APP_URL  (pour le return_url)
 */
async function initZitounaPay(params: {
  agencyId: string
  amountTnd: number
}): Promise<ZitounaPayResult> {
  const apiKey = process.env.ZITOUNA_PAY_API_KEY
  const merchantId = process.env.ZITOUNA_PAY_MERCHANT_ID
  const baseUrl =
    process.env.ZITOUNA_PAY_BASE_URL ?? "https://api.zitounapay.tn/v1"

  /* Stub actif tant que ZITOUNA_PAY_API_KEY n'est pas défini */
  if (!apiKey || !merchantId) {
    console.warn("[ZitounaPay] Clés absentes — mode stub activé")
    const orderId = `STUB-${Date.now()}`
    return {
      ok: true,
      orderId,
      payUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/pro/paiements/zitouna-stub?orderId=${orderId}`,
      error: "",
    }
  }

  try {
    const res = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Math.round(params.amountTnd * 1000), // millimes
        currency: "TND",
        description: `Rechargement wallet agence ${params.agencyId}`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/pro/paiements?status=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pro/paiements?status=cancel`,
        metadata: { agencyId: params.agencyId },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, orderId: "", payUrl: "", error: `HTTP ${res.status}: ${body}` }
    }

    const data = (await res.json()) as { order_id: string; pay_url: string }
    return { ok: true, orderId: data.order_id, payUrl: data.pay_url, error: "" }
  } catch (err) {
    return {
      ok: false,
      orderId: "",
      payUrl: "",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
