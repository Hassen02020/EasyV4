/**
 * Audit Logger - Système de traçabilité des actions critiques
 * 
 * Server Action réutilisable pour enregistrer toute action importante
 * dans la base de données avec immutabilité garantie.
 * 
 * Usage:
 * ```ts
 * await logAuditAction({
 *   action: "reservation.status_changed",
 *   entityType: "reservation",
 *   entityId: reservation.publicRef,
 *   oldValue: { status: "pending" },
 *   newValue: { status: "confirmed" },
 *   metadata: { reason: "Paiement reçu" }
 * })
 * ```
 */

"use server"

import { headers } from "next/headers"
import { getDb } from "@/lib/db/client"
import { auditLogs, type AuditActionType, type AuditEntityType, type NewAuditLog } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

// ============================================================================
// INTERFACES
// ============================================================================

interface LogAuditActionParams {
  /** Type d'action (enum) */
  action: AuditActionType
  /** Type d'entité concernée */
  entityType: AuditEntityType
  /** ID de l'entité (référence publique ou UUID) */
  entityId: string
  /** Valeur avant modification (snapshot) */
  oldValue?: Record<string, unknown>
  /** Valeur après modification (snapshot) */
  newValue?: Record<string, unknown>
  /** Métadonnées contextuelles additionnelles */
  metadata?: Record<string, unknown>
  /** ID d'agence forcé (pour cas spéciaux) */
  agencyId?: string
}

interface LogAuditResult {
  success: boolean
  logId?: string
  error?: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calcule le diff entre oldValue et newValue
 */
function computeChanges(
  oldValue: Record<string, unknown> | undefined,
  newValue: Record<string, unknown> | undefined
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!oldValue || !newValue) return undefined

  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)])

  for (const key of allKeys) {
    const oldVal = oldValue[key]
    const newVal = newValue[key]

    // Comparaison profonde simple
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { from: oldVal, to: newVal }
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined
}

/**
 * Récupère l'IP et User-Agent depuis les headers
 */
async function getRequestContext(): Promise<{
  ipAddress: string | null
  userAgent: string | null
}> {
  try {
    const headersList = await headers()
    
    // Récupération IP (header forwarded ou x-real-ip)
    const forwardedFor = headersList.get("x-forwarded-for")
    const realIp = headersList.get("x-real-ip")
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || realIp || null

    // User-Agent
    const userAgent = headersList.get("user-agent") || null

    return { ipAddress, userAgent }
  } catch {
    return { ipAddress: null, userAgent: null }
  }
}

// ============================================================================
// SERVER ACTION PRINCIPALE
// ============================================================================

/**
 * Enregistre une action dans les logs d'audit
 * 
 * Cette Server Action est sécurisée et peut être appelée depuis:
 * - Autres Server Actions
 * - Server Components (via form actions)
 * - Client Components (via form submission)
 */
export async function logAuditAction({
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  metadata,
  agencyId: forcedAgencyId,
}: LogAuditActionParams): Promise<LogAuditResult> {
  try {
    // 1. Récupération contexte utilisateur
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // On log quand même mais sans userId (action système)
      console.warn("[Audit] Action loggée sans authentification:", action)
    }

    // 2. Récupération profil et agence
    let userRole: string | null = null
    let agencyId: string | null = forcedAgencyId || null
    let userEmail: string | null = user?.email || null

    if (user) {
      const profile = await getCurrentAdminProfile(user.id)
      userRole = profile?.role || null
      agencyId = forcedAgencyId || profile?.agencyId || null
      userEmail = profile?.email || user.email || null
    }

    // Fallback: si pas d'agence, on ne peut pas logger (sauf si forced)
    if (!agencyId) {
      console.error("[Audit] Impossible de logger sans agencyId:", action)
      return { success: false, error: "Missing agency context" }
    }

    // 3. Récupération contexte requête (IP, User-Agent)
    const { ipAddress, userAgent } = await getRequestContext()

    // 4. Calcul du diff
    const changes = computeChanges(oldValue, newValue)

    // 5. Insertion en base
    const db = getDb()
    
    const logEntry: NewAuditLog = {
      agencyId,
      userId: user?.id || null,
      userEmail,
      userRole,
      action,
      entityType,
      entityId,
      oldValue: oldValue || null,
      newValue: newValue || null,
      changes: changes || null,
      ipAddress,
      userAgent,
      metadata: metadata || null,
    }

    const [inserted] = await db
      .insert(auditLogs)
      .values(logEntry)
      .returning({ id: auditLogs.id })

    if (!inserted) {
      throw new Error("Insertion failed")
    }

    console.log(`[Audit] Logged: ${action} on ${entityType}:${entityId} (logId: ${inserted.id})`)

    return { success: true, logId: inserted.id }
  } catch (error) {
    console.error("[Audit] Failed to log action:", error)
    // On retourne quand même success=false pour ne pas bloquer le flux
    // mais on log l'erreur pour monitoring
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }
  }
}

// ============================================================================
// HELPERS SPÉCIALISÉS
// ============================================================================

/**
 * Log un changement de statut de réservation
 */
export async function logReservationStatusChange(
  reservationId: string,
  oldStatus: string,
  newStatus: string,
  metadata?: { reason?: string; processedBy?: string }
) {
  return logAuditAction({
    action: "reservation.status_changed",
    entityType: "reservation",
    entityId: reservationId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    metadata,
  })
}

/**
 * Log un changement de prix produit
 */
export async function logProductPriceChange(
  productId: string,
  productSku: string,
  oldPrice: number,
  newPrice: number,
  currency: string = "TND",
  metadata?: { reason?: string }
) {
  return logAuditAction({
    action: "product.price_changed",
    entityType: "product",
    entityId: productSku,
    oldValue: { basePrice: oldPrice, currency },
    newValue: { basePrice: newPrice, currency },
    metadata: { ...metadata, productId },
  })
}

/**
 * Log un paiement traité
 */
export async function logPaymentProcessed(
  paymentId: string,
  reservationId: string,
  amount: number,
  currency: string,
  method: string,
  metadata?: { invoiceId?: string; processedBy?: string }
) {
  return logAuditAction({
    action: "payment.processed",
    entityType: "payment",
    entityId: paymentId,
    newValue: { amount, currency, method, reservationId },
    metadata,
  })
}

/**
 * Log un remboursement
 */
export async function logRefundProcessed(
  refundId: string,
  originalPaymentId: string,
  amount: number,
  currency: string,
  reason?: string
) {
  return logAuditAction({
    action: "payment.refunded",
    entityType: "payment",
    entityId: refundId,
    newValue: { amount, currency, originalPaymentId, reason },
  })
}

/**
 * Log une action staff (création/modification/suppression)
 */
export async function logStaffAction(
  action: "staff.created" | "staff.updated" | "staff.deleted",
  staffId: string,
  staffEmail: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>
) {
  return logAuditAction({
    action,
    entityType: "user",
    entityId: staffId,
    oldValue,
    newValue,
    metadata: { staffEmail },
  })
}

/**
 * Log une connexion/déconnexion
 */
export async function logAuthAction(
  action: "user.login" | "user.logout",
  userId: string,
  userEmail: string
) {
  return logAuditAction({
    action,
    entityType: "user",
    entityId: userId,
    metadata: { userEmail },
  })
}

// ============================================================================
// QUERY HELPERS (pour affichage des logs)
// ============================================================================

import { desc, eq, and, gte, lte } from "drizzle-orm"

/**
 * Récupère les logs d'audit pour une agence
 */
export async function getAuditLogs(params: {
  agencyId: string
  entityType?: AuditEntityType
  entityId?: string
  action?: AuditActionType
  userId?: string
  fromDate?: Date
  toDate?: Date
  limit?: number
  offset?: number
}) {
  const { agencyId, entityType, entityId, action, userId, fromDate, toDate, limit = 50, offset = 0 } = params

  try {
    const db = getDb()

    let query = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.agencyId, agencyId))

    // Filtres optionnels
    const filters = [eq(auditLogs.agencyId, agencyId)]
    
    if (entityType) filters.push(eq(auditLogs.entityType, entityType))
    if (entityId) filters.push(eq(auditLogs.entityId, entityId))
    if (action) filters.push(eq(auditLogs.action, action))
    if (userId) filters.push(eq(auditLogs.userId, userId))
    if (fromDate) filters.push(gte(auditLogs.createdAt, fromDate))
    if (toDate) filters.push(lte(auditLogs.createdAt, toDate))

    const results = await db
      .select()
      .from(auditLogs)
      .where(and(...filters))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return { success: true, logs: results }
  } catch (error) {
    console.error("[Audit] Failed to fetch logs:", error)
    return { success: false, error: "Failed to fetch audit logs" }
  }
}
