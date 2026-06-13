/**
 * Wallet Service - Easy2Book V6
 *
 * Service de gestion des transactions wallet avec atomicité Drizzle
 * Toutes les opérations financières doivent être exécutées dans une transaction
 */

import { getDb } from "@/lib/db/client"
import { eq, and, sql } from "drizzle-orm"
import {
  walletAccounts,
  walletLedger,
  marginRules,
  reservationFinancials,
  journalEntries,
  journalLines,
  auditLogs,
} from "@/lib/db/schema"
import type {
  WalletAccount,
  NewWalletLedger,
  MarginRule,
  MarginCalculationContext,
  MarginCalculationResult,
} from "@/lib/db/schema"
import { findApplicableMarginRule, calculateMargin } from "./margin-calculator"

/**
 * Opération de débit wallet
 */
export interface DebitWalletOptions {
  agencyId: string
  amount: number
  description: string
  category?: string
  reservationId?: string
  paymentId?: string
  createdBy?: string
}

/**
 * Opération de crédit wallet
 */
export interface CreditWalletOptions {
  agencyId: string
  amount: number
  description: string
  category?: string
  rechargeRequestId?: string
  createdBy?: string
}

/**
 * Résultat d'une transaction wallet
 */
export interface WalletTransactionResult {
  success: boolean
  walletAccountId: string
  transactionId?: string
  balanceBefore: number
  balanceAfter: number
  error?: string
}

/**
 * Débite un compte wallet (réservation, commission, etc.)
 * Opération atomique : vérifie solde → débite → met à jour solde → crée écriture comptable
 */
export async function debitWallet(
  options: DebitWalletOptions
): Promise<WalletTransactionResult> {
  const db = getDb()

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer le compte wallet de l'agence
      const wallet = await tx.query.walletAccounts.findFirst({
        where: and(
          eq(walletAccounts.agencyId, options.agencyId),
          eq(walletAccounts.type, "credit")
        ),
      })

      if (!wallet) {
        throw new Error("Compte wallet non trouvé pour cette agence")
      }

      const balanceBefore = Number(wallet.currentBalance)
      const balanceAfter = balanceBefore - options.amount

      // 2. Vérifier le solde (et la limite de crédit si configurée)
      if (balanceAfter < 0) {
        const creditLimit = wallet.creditLimit ? Number(wallet.creditLimit) : 0
        if (balanceAfter < -creditLimit) {
          throw new Error("Solde insuffisant")
        }
      }

      // 3. Créer la transaction wallet
      const transaction = await tx.insert(walletLedger).values({
        walletAccountId: wallet.id,
        type: "debit",
        status: "completed",
        amount: options.amount.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        description: options.description,
        category: options.category || "booking",
        reservationId: options.reservationId,
        paymentId: options.paymentId,
        createdBy: options.createdBy,
      }).returning()

      // 4. Mettre à jour le solde du compte
      await tx
        .update(walletAccounts)
        .set({
          currentBalance: balanceAfter.toString(),
          updatedAt: new Date(),
        })
        .where(eq(walletAccounts.id, wallet.id))

      // 5. Créer l'écriture comptable (Grand Livre)
      if (options.reservationId) {
        await createJournalEntryForDebit(tx, {
          agencyId: options.agencyId,
          amount: options.amount,
          reservationId: options.reservationId,
          walletLedgerId: transaction[0].id,
          description: options.description,
          createdBy: options.createdBy,
        })
      }

      // 6. Log d'audit
      await tx.insert(auditLogs).values({
        agencyId: options.agencyId,
        entityType: "wallet_account",
        entityId: wallet.id,
        action: "update",
        oldValues: { balance: balanceBefore },
        newValues: { balance: balanceAfter },
        description: `Débit wallet: ${options.description}`,
        userId: options.createdBy,
      })

      return {
        success: true,
        walletAccountId: wallet.id,
        transactionId: transaction[0].id,
        balanceBefore,
        balanceAfter,
      }
    })
  } catch (error) {
    return {
      success: false,
      walletAccountId: "",
      balanceBefore: 0,
      balanceAfter: 0,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    }
  }
}

/**
 * Crédite un compte wallet (recharge, remboursement, etc.)
 * Opération atomique : crédite → met à jour solde → crée écriture comptable
 */
export async function creditWallet(
  options: CreditWalletOptions
): Promise<WalletTransactionResult> {
  const db = getDb()

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer le compte wallet de l'agence
      const wallet = await tx.query.walletAccounts.findFirst({
        where: and(
          eq(walletAccounts.agencyId, options.agencyId),
          eq(walletAccounts.type, "credit")
        ),
      })

      if (!wallet) {
        throw new Error("Compte wallet non trouvé pour cette agence")
      }

      const balanceBefore = Number(wallet.currentBalance)
      const balanceAfter = balanceBefore + options.amount

      // 2. Créer la transaction wallet
      const transaction = await tx.insert(walletLedger).values({
        walletAccountId: wallet.id,
        type: "credit",
        status: "completed",
        amount: options.amount.toString(),
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        description: options.description,
        category: options.category || "recharge",
        rechargeRequestId: options.rechargeRequestId,
        createdBy: options.createdBy,
      }).returning()

      // 3. Mettre à jour le solde du compte
      await tx
        .update(walletAccounts)
        .set({
          currentBalance: balanceAfter.toString(),
          updatedAt: new Date(),
        })
        .where(eq(walletAccounts.id, wallet.id))

      // 4. Créer l'écriture comptable
      await createJournalEntryForCredit(tx, {
        agencyId: options.agencyId,
        amount: options.amount,
        walletLedgerId: transaction[0].id,
        description: options.description,
        createdBy: options.createdBy,
      })

      // 5. Log d'audit
      await tx.insert(auditLogs).values({
        agencyId: options.agencyId,
        entityType: "wallet_account",
        entityId: wallet.id,
        action: "update",
        oldValues: { balance: balanceBefore },
        newValues: { balance: balanceAfter },
        description: `Crédit wallet: ${options.description}`,
        userId: options.createdBy,
      })

      return {
        success: true,
        walletAccountId: wallet.id,
        transactionId: transaction[0].id,
        balanceBefore,
        balanceAfter,
      }
    })
  } catch (error) {
    return {
      success: false,
      walletAccountId: "",
      balanceBefore: 0,
      balanceAfter: 0,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    }
  }
}

/**
 * Traite une réservation avec calcul de marge automatique
 * Opération atomique : calcule marge → débite wallet → enregistre financials → écriture comptable
 */
export async function processReservationWithMargin(
  context: MarginCalculationContext,
  reservationId: string,
  createdBy?: string
) {
  const db = getDb()

  return await db.transaction(async (tx) => {
    // 1. Récupérer les règles de marge applicables
    const rules = await tx.query.marginRules.findMany({
      where: eq(marginRules.agencyId, context.agencyId),
    })

    // 2. Calculer la marge
    const applicableRule = findApplicableMarginRule(rules, context)
    const marginResult = calculateMargin(context, applicableRule)

    // 3. Valider le calcul
    if (marginResult.salePriceTnd <= marginResult.supplierPriceTnd) {
      throw new Error("Le prix de vente doit être supérieur au prix achat")
    }

    // 4. Enregistrer les financials de la réservation
    const financial = await tx.insert(reservationFinancials).values({
      reservationId,
      supplierPrice: context.supplierPrice.toString(),
      supplierCurrency: context.supplierCurrency,
      supplierPriceTnd: marginResult.supplierPriceTnd.toString(),
      salePrice: marginResult.salePriceOriginal.toString(),
      saleCurrency: context.supplierCurrency,
      salePriceTnd: marginResult.salePriceTnd.toString(),
      marginAmount: marginResult.marginAmount.toString(),
      marginPercent: marginResult.marginPercent.toString(),
      marginRuleId: marginResult.marginRuleId,
      commissionAmount: marginResult.commissionAmount.toString(),
      commissionPercent: marginResult.commissionPercent.toString(),
      exchangeRate: context.exchangeRate?.toString() || "1",
      exchangeRateAt: new Date(),
    }).returning()

    // 5. Débiter le wallet du client
    const debitResult = await debitWallet({
      agencyId: context.agencyId,
      amount: marginResult.salePriceTnd,
      description: `Réservation ${reservationId}`,
      category: "booking",
      reservationId,
      createdBy,
    })

    if (!debitResult.success) {
      throw new Error(debitResult.error || "Échec du débit wallet")
    }

    // 6. Créer l'écriture comptable pour la marge
    await createJournalEntryForMargin(tx, {
      agencyId: context.agencyId,
      reservationId,
      marginResult,
      financialId: financial[0].id,
      createdBy,
    })

    return {
      success: true,
      marginResult,
      financialId: financial[0].id,
      walletTransactionId: debitResult.transactionId,
    }
  })
}

/**
 * Crée une écriture comptable pour un débit
 */
async function createJournalEntryForDebit(
  tx: any,
  options: {
    agencyId: string
    amount: number
    reservationId: string
    walletLedgerId: string
    description: string
    createdBy?: string
  }
) {
  const journalEntry = await tx.insert(journalEntries).values({
    agencyId: options.agencyId,
    reference: `RES-${options.reservationId}`,
    referenceType: "reservation",
    entryDate: new Date(),
    description: options.description,
    totalDebit: options.amount.toString(),
    totalCredit: options.amount.toString(),
    status: "posted",
    createdBy: options.createdBy,
  }).returning()

  const entryId = journalEntry[0].id

  // Ligne débit (client)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "411000",
    accountName: "Clients - Comptes courants",
    debit: options.amount.toString(),
    credit: "0",
    description: "Encaissement client",
    reservationId: options.reservationId,
    walletLedgerId: options.walletLedgerId,
  })

  // Ligne crédit (vente)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "701000",
    accountName: "Ventes de services touristiques",
    debit: "0",
    credit: options.amount.toString(),
    description: "Vente réservation",
    reservationId: options.reservationId,
  })
}

/**
 * Crée une écriture comptable pour un crédit
 */
async function createJournalEntryForCredit(
  tx: any,
  options: {
    agencyId: string
    amount: number
    walletLedgerId: string
    description: string
    createdBy?: string
  }
) {
  const journalEntry = await tx.insert(journalEntries).values({
    agencyId: options.agencyId,
    reference: `REC-${Date.now()}`,
    referenceType: "payment",
    entryDate: new Date(),
    description: options.description,
    totalDebit: options.amount.toString(),
    totalCredit: options.amount.toString(),
    status: "posted",
    createdBy: options.createdBy,
  }).returning()

  const entryId = journalEntry[0].id

  // Ligne débit (banque/wallet)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "512000",
    accountName: "Banques",
    debit: options.amount.toString(),
    credit: "0",
    description: "Encaissement",
    walletLedgerId: options.walletLedgerId,
  })

  // Ligne crédit (client)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "411000",
    accountName: "Clients - Comptes courants",
    debit: "0",
    credit: options.amount.toString(),
    description: "Crédit client",
  })
}

/**
 * Crée une écriture comptable pour la marge
 */
async function createJournalEntryForMargin(
  tx: any,
  options: {
    agencyId: string
    reservationId: string
    marginResult: MarginCalculationResult
    financialId: string
    createdBy?: string
  }
) {
  const { marginResult } = options

  const journalEntry = await tx.insert(journalEntries).values({
    agencyId: options.agencyId,
    reference: `MARGIN-${options.reservationId}`,
    referenceType: "reservation",
    entryDate: new Date(),
    description: `Marge réservation ${options.reservationId}`,
    totalDebit: marginResult.marginAmount.toString(),
    totalCredit: marginResult.marginAmount.toString(),
    status: "posted",
    createdBy: options.createdBy,
  }).returning()

  const entryId = journalEntry[0].id

  // Ligne débit (coût achat)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "603000",
    accountName: "Achats de services touristiques",
    debit: marginResult.supplierPriceTnd.toString(),
    credit: "0",
    description: "Coût fournisseur",
    reservationId: options.reservationId,
  })

  // Ligne crédit (marge)
  await tx.insert(journalLines).values({
    journalEntryId: entryId,
    accountCode: "707000",
    accountName: "Marge commerciale",
    debit: "0",
    credit: marginResult.marginAmount.toString(),
    description: "Marge générée",
    reservationId: options.reservationId,
  })
}

/**
 * Récupère le solde actuel d'une agence
 */
export async function getWalletBalance(agencyId: string): Promise<number> {
  const db = getDb()
  const wallet = await db.query.walletAccounts.findFirst({
    where: and(
      eq(walletAccounts.agencyId, agencyId),
      eq(walletAccounts.type, "credit")
    ),
  })

  return wallet ? Number(wallet.currentBalance) : 0
}

/**
 * Récupère l'historique des transactions wallet
 */
export async function getWalletTransactions(
  agencyId: string,
  limit: number = 50
) {
  const db = getDb()
  const wallet = await db.query.walletAccounts.findFirst({
    where: and(
      eq(walletAccounts.agencyId, agencyId),
      eq(walletAccounts.type, "credit")
    ),
  })

  if (!wallet) {
    return []
  }

  return db.query.walletLedger.findMany({
    where: eq(walletLedger.walletAccountId, wallet.id),
    orderBy: (walletLedger, { desc }) => [desc(walletLedger.createdAt)],
    limit,
  })
}
