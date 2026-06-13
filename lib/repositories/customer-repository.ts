/**
 * Customer Repository - Easy2Book V6
 *
 * Repository pour les opérations DB liées aux clients
 * Centralise tous les appels Drizzle pour les tables customers
 */

import { eq, and, desc, sql, type SQL, like, or } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import {
  customers,
  type Customer,
  type NewCustomer,
} from "@/lib/db/schema"

export class CustomerRepository {
  /**
   * Récupérer un client par ID
   */
  static async findById(id: string): Promise<Customer | null> {
    const db = getDb()
    const result = await db.query.customers.findFirst({
      where: eq(customers.id, id),
    })
    return result || null
  }

  /**
   * Récupérer un client par email
   */
  static async findByEmail(email: string): Promise<Customer | null> {
    const db = getDb()
    const result = await db.query.customers.findFirst({
      where: eq(customers.email, email),
    })
    return result || null
  }

  /**
   * Récupérer un client par téléphone
   */
  static async findByPhone(phone: string): Promise<Customer | null> {
    const db = getDb()
    const result = await db.query.customers.findFirst({
      where: eq(customers.phone, phone),
    })
    return result || null
  }

  /**
   * Récupérer les clients d'une agence
   */
  static async findByAgency(
    agencyId: string,
    limit = 50,
    offset = 0
  ): Promise<Customer[]> {
    const db = getDb()
    return db.query.customers.findMany({
      where: eq(customers.agencyId, agencyId),
      orderBy: [desc(customers.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Rechercher des clients par nom ou email
   */
  static async search(
    agencyId: string,
    query: string,
    limit = 50,
    offset = 0
  ): Promise<Customer[]> {
    const db = getDb()
    const searchPattern = `%${query}%`
    return db.query.customers.findMany({
      where: and(
        eq(customers.agencyId, agencyId),
        or(
          like(customers.firstName, searchPattern),
          like(customers.lastName, searchPattern),
          like(customers.email, searchPattern),
          like(customers.phone, searchPattern)
        )
      ),
      orderBy: [desc(customers.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Créer un client
   */
  static async create(
    data: NewCustomer,
    tx?: DrizzleTransaction
  ): Promise<Customer> {
    const db = tx || getDb()
    const [customer] = await db.insert(customers).values(data).returning()
    return customer
  }

  /**
   * Mettre à jour un client
   */
  static async update(
    id: string,
    data: Partial<NewCustomer>,
    tx?: DrizzleTransaction
  ): Promise<Customer> {
    const db = tx || getDb()
    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning()
    return customer
  }

  /**
   * Mettre à jour les informations de contact
   */
  static async updateContact(
    id: string,
    email?: string,
    phone?: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(customers)
      .set({ 
        ...(email && { email }),
        ...(phone && { phone }),
        updatedAt: new Date()
      })
      .where(eq(customers.id, id))
  }

  /**
   * Mettre à jour les préférences du client
   */
  static async updatePreferences(
    id: string,
    preferences: Record<string, unknown>,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(customers)
      .set({ 
        preferences: preferences as any,
        updatedAt: new Date()
      })
      .where(eq(customers.id, id))
  }

  /**
   * Compter les clients d'une agence
   */
  static async countByAgency(agencyId: string): Promise<number> {
    const db = getDb()
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.agencyId, agencyId))
    return result[0]?.count || 0
  }

  /**
   * Récupérer les statistiques de clients d'une agence
   */
  static async getAgencyStats(agencyId: string) {
    const db = getDb()
    const allCustomers = await this.findByAgency(agencyId, 1000)
    
    const byType = allCustomers.reduce((acc, c) => {
      acc[c.type] = (acc[c.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const byStatus = allCustomers.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      total: allCustomers.length,
      byType,
      byStatus,
    }
  }
}
