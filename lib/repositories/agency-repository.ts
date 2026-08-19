/**
 * Agency Repository - Easy2Book V6
 *
 * Repository pour les opérations DB liées aux agences
 * Centralise tous les appels Drizzle pour les tables agencies
 */

import { eq, and, desc, sql, type SQL, like, or } from "drizzle-orm"
import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import {
  agencies,
  type Agency,
  type NewAgency,
} from "@/lib/db/schema"

export class AgencyRepository {
  /**
   * Récupérer une agence par ID
   */
  static async findById(id: string): Promise<Agency | null> {
    const db = getDb()
    const result = await db.query.agencies.findFirst({
      where: eq(agencies.id, id),
    })
    return result || null
  }

  /**
   * Récupérer une agence par slug
   */
  static async findBySlug(slug: string): Promise<Agency | null> {
    const db = getDb()
    const result = await db.query.agencies.findFirst({
      where: eq(agencies.slug, slug),
    })
    return result || null
  }

  /**
   * Récupérer toutes les agences
   */
  static async findAll(
    limit = 50,
    offset = 0
  ): Promise<Agency[]> {
    const db = getDb()
    return db.query.agencies.findMany({
      orderBy: [desc(agencies.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les agences par type
   */
  static async findByType(
    agencyType: Agency["agencyType"],
    limit = 50,
    offset = 0
  ): Promise<Agency[]> {
    const db = getDb()
    return db.query.agencies.findMany({
      where: eq(agencies.agencyType, agencyType),
      orderBy: [desc(agencies.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Récupérer les agences par statut
   */
  static async findByStatus(
    status: string,
    limit = 50,
    offset = 0
  ): Promise<Agency[]> {
    const db = getDb()
    return db.query.agencies.findMany({
      where: eq(agencies.status, status),
      orderBy: [desc(agencies.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Rechercher des agences par nom, slug ou email de contact
   */
  static async search(
    query: string,
    limit = 50,
    offset = 0
  ): Promise<Agency[]> {
    const db = getDb()
    const searchPattern = `%${query}%`
    return db.query.agencies.findMany({
      where: or(
        like(agencies.name, searchPattern),
        like(agencies.slug, searchPattern),
        like(agencies.contactEmail, searchPattern)
      ),
      orderBy: [desc(agencies.createdAt)],
      limit,
      offset,
    })
  }

  /**
   * Créer une agence
   */
  static async create(
    data: NewAgency,
    tx?: DrizzleTransaction
  ): Promise<Agency> {
    const db = tx || getDb()
    const [agency] = await db.insert(agencies).values(data).returning()
    return agency
  }

  /**
   * Mettre à jour une agence
   */
  static async update(
    id: string,
    data: Partial<NewAgency>,
    tx?: DrizzleTransaction
  ): Promise<Agency> {
    const db = tx || getDb()
    const [agency] = await db
      .update(agencies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agencies.id, id))
      .returning()
    return agency
  }

  /**
   * Mettre à jour le statut d'une agence
   */
  static async updateStatus(
    id: string,
    status: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(agencies)
      .set({ status, updatedAt: new Date() })
      .where(eq(agencies.id, id))
  }

  /**
   * Mettre à jour les informations de contact
   */
  static async updateContact(
    id: string,
    contactEmail?: string,
    contactPhone?: string,
    tx?: DrizzleTransaction
  ): Promise<void> {
    const db = tx || getDb()
    await db
      .update(agencies)
      .set({
        ...(contactEmail && { contactEmail }),
        ...(contactPhone && { contactPhone }),
        updatedAt: new Date()
      })
      .where(eq(agencies.id, id))
  }

  /**
   * Compter les agences
   */
  static async count(): Promise<number> {
    const db = getDb()
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(agencies)
    return result[0]?.count || 0
  }

  /**
   * Compter les agences par statut
   */
  static async countByStatus(status: string): Promise<number> {
    const db = getDb()
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(agencies)
      .where(eq(agencies.status, status))
    return result[0]?.count || 0
  }

  /**
   * Récupérer les statistiques globales des agences
   */
  static async getGlobalStats() {
    const db = getDb()
    const allAgencies = await this.findAll(1000)

    const byType = allAgencies.reduce((acc, a) => {
      acc[a.agencyType] = (acc[a.agencyType] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const byStatus = allAgencies.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      total: allAgencies.length,
      byType,
      byStatus,
    }
  }
}
