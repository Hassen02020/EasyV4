/**
 * Reservation Repository - Easy2Book V6
 *
 * Repository pour les opérations DB liées aux réservations
 * Centralise tous les appels Drizzle pour les tables reservations
 */

import { eq, and, desc, sql, type SQL } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  type Reservation,
  type NewReservation,
} from "@/lib/db/schema"

export class ReservationRepository {
  /**
   * Récupérer une réservation par ID
   */
  static async findById(id: string): Promise<Reservation | null> {
    const db = getDb()
    const result = await db.query.reservations.findFirst({
      where: eq(reservations.id, id),
    })
    return result || null
  }

  /**
   * Récupérer une réservation par référence publique
   */
  static async findByPublicRef(publicRef: string): Promise<Reservation | null> {
    const db = getDb()
    const result = await db.query.reservations.findFirst({
      where: eq(reservations.publicRef, publicRef),
    })
    return result || null
  }

  /**
   * Récupérer les réservations d'une agence
   */
  static async findByAgency(
    agencyId: string,
    limit = 50,
    offset = 0
  ): Promise<Reservation[]> {
    const db = getDb()
    return db.query.reservations.findMany({
      where: eq(reservations.agencyId, agencyId),
      orderBy: [desc(reservations.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les réservations d'un client
   */
  static async findByCustomer(
    customerId: string,
    limit = 50,
    offset = 0
  ): Promise<Reservation[]> {
    const db = getDb()
    return db.query.reservations.findMany({
      where: eq(reservations.customerId, customerId),
      orderBy: [desc(reservations.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Créer une réservation
   */
  static async create(
    data: NewReservation,
    tx?: DrizzleTransaction
  ): Promise<Reservation> {
    const db = tx || getDb()
    const [reservation] = await db.insert(reservations).values(data).returning()
    return reservation
  }

  /**
   * Mettre à jour une réservation
   */
  static async update(
    id: string,
    data: Partial<NewReservation>,
    tx?: DrizzleTransaction
  ): Promise<Reservation> {
    const db = tx || getDb()
    const [reservation] = await db
      .update(reservations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning()
    return reservation
  }

  /**
   * Mettre à jour le statut d'une réservation
   */
  static async updateStatus(
    id: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(reservations)
      .set({ status, updatedAt: new Date() })
      .where(eq(reservations.id, id))
  }

  /**
   * Mettre à jour l'acompte payé
   */
  static async updateDepositPaid(
    id: string,
    depositPaid: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(reservations)
      .set({ depositPaid, updatedAt: new Date() })
      .where(eq(reservations.id, id))
  }

  /**
   * Mettre à jour l'URL du voucher
   */
  static async updateVoucherUrl(
    id: string,
    voucherUrl: string,
    voucherQr?: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(reservations)
      .set({ 
        voucherUrl,
        ...(voucherQr && { voucherQr }),
        updatedAt: new Date()
      })
      .where(eq(reservations.id, id))
  }

  /**
   * Récupérer les réservations par statut
   */
  static async findByStatus(
    agencyId: string,
    status: string,
    limit = 50,
    offset = 0
  ): Promise<Reservation[]> {
    const db = getDb()
    return db.query.reservations.findMany({
      where: and(
        eq(reservations.agencyId, agencyId),
        eq(reservations.status, status)
      ),
      orderBy: [desc(reservations.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les réservations par module
   */
  static async findByModule(
    agencyId: string,
    module: string,
    limit = 50,
    offset = 0
  ): Promise<Reservation[]> {
    const db = getDb()
    return db.query.reservations.findMany({
      where: and(
        eq(reservations.agencyId, agencyId),
        eq(reservations.module, module)
      ),
      orderBy: [desc(reservations.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Compter les réservations d'une agence
   */
  static async countByAgency(agencyId: string): Promise<number> {
    const db = getDb()
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(reservations)
      .where(eq(reservations.agencyId, agencyId))
    return result[0]?.count || 0
  }

  /**
   * Récupérer les statistiques de réservations d'une agence
   */
  static async getAgencyStats(agencyId: string) {
    const db = getDb()
    const allReservations = await this.findByAgency(agencyId, 1000)
    
    const byStatus = allReservations.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const byModule = allReservations.reduce((acc, r) => {
      acc[r.module] = (acc[r.module] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const totalAmount = allReservations.reduce(
      (sum, r) => sum + Number(r.tndAmount),
      0
    )
    
    return {
      total: allReservations.length,
      byStatus,
      byModule,
      totalAmount,
    }
  }
}
