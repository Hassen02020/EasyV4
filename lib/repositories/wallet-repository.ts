/**
 * Wallet Repository - Easy2Book V6
 *
 * Repository pour les opérations DB liées au wallet
 * Centralise tous les appels Drizzle pour les tables wallet
 */

import { eq, and, desc, sql, type SQL } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import {
  walletAccounts,
  walletLedger,
  walletTransactions,
  type WalletAccount,
  type NewWalletAccount,
  type WalletLedger,
  type NewWalletLedger,
  type WalletTransaction,
  type NewWalletTransaction,
} from "@/lib/db/schema"

export class WalletRepository {
  /**
   * Récupérer un compte wallet par agence et type
   */
  static async findByAgencyAndType(
    agencyId: string,
    type: string
  ): Promise<WalletAccount | null> {
    const db = getDb()
    const result = await db.query.walletAccounts.findFirst({
      where: and(
        eq(walletAccounts.agencyId, agencyId),
        eq(walletAccounts.type, type)
      ),
    })
    return result || null
  }

  /**
   * Récupérer tous les comptes wallet d'une agence
   */
  static async findByAgency(agencyId: string): Promise<WalletAccount[]> {
    const db = getDb()
    return db.query.walletAccounts.findMany({
      where: eq(walletAccounts.agencyId, agencyId),
    })
  }

  /**
   * Créer un compte wallet
   */
  static async createAccount(
    data: NewWalletAccount
  ): Promise<WalletAccount> {
    const db = getDb()
    const [account] = await db.insert(walletAccounts).values(data).returning()
    return account
  }

  /**
   * Mettre à jour le solde d'un compte wallet
   */
  static async updateBalance(
    accountId: string,
    balance: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(walletAccounts)
      .set({
        currentBalance: balance,
        updatedAt: new Date(),
      })
      .where(eq(walletAccounts.id, accountId))
  }

  /**
   * Créer une entrée dans le ledger wallet
   */
  static async createLedgerEntry(
    data: NewWalletLedger,
    tx?: DrizzleTransaction
  ): Promise<WalletLedger> {
    const db = tx || getDb()
    const [entry] = await db.insert(walletLedger).values(data).returning()
    return entry
  }

  /**
   * Récupérer le ledger d'un compte wallet
   */
  static async getLedgerByAccount(
    accountId: string,
    limit = 50,
    offset = 0
  ): Promise<WalletLedger[]> {
    const db = getDb()
    return db.query.walletLedger.findMany({
      where: eq(walletLedger.walletAccountId, accountId),
      orderBy: [desc(walletLedger.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les transactions wallet d'une agence
   */
  static async getTransactionsByAgency(
    agencyId: string,
    limit = 50,
    offset = 0
  ): Promise<WalletTransaction[]> {
    const db = getDb()
    return db.query.walletTransactions.findMany({
      where: eq(walletTransactions.agencyId, agencyId),
      orderBy: [desc(walletTransactions.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Créer une transaction wallet
   */
  static async createTransaction(
    data: NewWalletTransaction,
    tx?: DrizzleTransaction
  ): Promise<WalletTransaction> {
    const db = tx || getDb()
    const [transaction] = await db.insert(walletTransactions).values(data).returning()
    return transaction
  }

  /**
   * Mettre à jour le statut d'une transaction wallet
   */
  static async updateTransactionStatus(
    transactionId: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(walletTransactions)
      .set({ status })
      .where(eq(walletTransactions.id, transactionId))
  }

  /**
   * Récupérer le solde actuel d'un compte wallet
   */
  static async getBalance(accountId: string): Promise<string> {
    const db = getDb()
    const account = await db.query.walletAccounts.findFirst({
      where: eq(walletAccounts.id, accountId),
      columns: {
        currentBalance: true,
      },
    })
    return account?.currentBalance || "0"
  }

  /**
   * Récupérer les statistiques wallet d'une agence
   */
  static async getAgencyStats(agencyId: string) {
    const db = getDb()
    const accounts = await this.findByAgency(agencyId)
    
    const totalBalance = accounts.reduce(
      (sum, acc) => sum + Number(acc.currentBalance),
      0
    )
    
    const pendingTransactions = await db.query.walletTransactions.findMany({
      where: and(
        eq(walletTransactions.agencyId, agencyId),
        eq(walletTransactions.status, "PENDING")
      ),
    })
    
    return {
      totalBalance,
      accountCount: accounts.length,
      pendingTransactionCount: pendingTransactions.length,
    }
  }
}
