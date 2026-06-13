/**
 * Payment Repository - Easy2Book V6
 *
 * Repository pour les opérations DB liées aux paiements
 * Centralise tous les appels Drizzle pour les tables payments
 */

import { eq, and, desc, sql, type SQL } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import {
  payments,
  type Payment,
  type NewPayment,
} from "@/lib/db/schema"

export class PaymentRepository {
  /**
   * Récupérer un paiement par ID
   */
  static async findById(id: string): Promise<Payment | null> {
    const db = getDb()
    const result = await db.query.payments.findFirst({
      where: eq(payments.id, id),
    })
    return result || null
  }

  /**
   * Récupérer les paiements d'une réservation
   */
  static async findByReservation(
    reservationId: string,
    limit = 50,
    offset = 0
  ): Promise<Payment[]> {
    const db = getDb()
    return db.query.payments.findMany({
      where: eq(payments.reservationId, reservationId),
      orderBy: [desc(payments.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les paiements d'une agence
   */
  static async findByAgency(
    agencyId: string,
    limit = 50,
    offset = 0
  ): Promise<Payment[]> {
    const db = getDb()
    return db.query.payments.findMany({
      where: eq(payments.agencyId, agencyId),
      orderBy: [desc(payments.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Créer un paiement
   */
  static async create(
    data: NewPayment,
    tx?: DrizzleTransaction
  ): Promise<Payment> {
    const db = tx || getDb()
    const [payment] = await db.insert(payments).values(data).returning()
    return payment
  }

  /**
   * Mettre à jour un paiement
   */
  static async update(
    id: string,
    data: Partial<NewPayment>,
    tx?: DrizzleTransaction
  ): Promise<Payment> {
    const db = tx || getDb()
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning()
    return payment
  }

  /**
   * Mettre à jour le statut d'un paiement
   */
  static async updateStatus(
    id: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, id))
  }

  /**
   * Mettre à jour le montant remboursé
   */
  static async updateRefundedAmount(
    id: string,
    refundedAmount: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(payments)
      .set({ refundedAmount, refundedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, id))
  }

  /**
   * Récupérer les paiements par statut
   */
  static async findByStatus(
    agencyId: string,
    status: string,
    limit = 50,
    offset = 0
  ): Promise<Payment[]> {
    const db = getDb()
    return db.query.payments.findMany({
      where: and(
        eq(payments.agencyId, agencyId),
        eq(payments.status, status)
      ),
      orderBy: [desc(payments.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les paiements par PSP order ID
   */
  static async findByPspOrderId(
    pspOrderId: string
  ): Promise<Payment | null> {
    const db = getDb()
    const result = await db.query.payments.findFirst({
      where: eq(payments.pspOrderId, pspOrderId),
    })
    return result || null
  }

  /**
   * Compter les paiements d'une réservation
   */
  static async countByReservation(reservationId: string): Promise<number> {
    const db = getDb()
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.reservationId, reservationId))
    return result[0]?.count || 0
  }

  /**
   * Récupérer les statistiques de paiements d'une agence
   */
  static async getAgencyStats(agencyId: string) {
    const db = getDb()
    const allPayments = await this.findByAgency(agencyId, 1000)
    
    const byStatus = allPayments.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const byPsp = allPayments.reduce((acc, p) => {
      acc[p.psp] = (acc[p.psp] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const totalAmount = allPayments.reduce(
      (sum, p) => sum + Number(p.tndAmount),
      0
    )
    
    const totalRefunded = allPayments.reduce(
      (sum, p) => sum + Number(p.refundedAmount),
      0
    )
    
    return {
      total: allPayments.length,
      byStatus,
      byPsp,
      totalAmount,
      totalRefunded,
    }
  }
}
