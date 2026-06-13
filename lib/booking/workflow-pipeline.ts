/**
 * Booking Workflow Pipeline - Easy2Book V6
 *
 * Pipeline de validation des réservations :
 * Request → Provider API → Confirmation → Wallet Debit → Invoice Generation
 *
 * Chaque étape est atomique et réversible en cas d'erreur
 */

import { getDb } from "@/lib/db/client"
import { eq, and, sql } from "drizzle-orm"
import {
  reservations,
  reservationFinancials,
  walletLedger,
  journalEntries,
  apiLogs,
  reservationStatusHistory,
  auditLogs,
} from "@/lib/db/schema"
import { debitWallet, processReservationWithMargin } from "@/lib/finance/wallet-service"
import type { MarginCalculationContext } from "@/lib/finance/margin-calculator"

/**
 * État du workflow de réservation
 */
export type BookingWorkflowState =
  | "draft"
  | "pending_provider"
  | "provider_confirmed"
  | "pending_payment"
  | "payment_processing"
  | "payment_failed"
  | "confirmed"
  | "cancelled"
  | "failed"

/**
 * Contexte de création de réservation
 */
export interface CreateReservationContext {
  agencyId: string
  customerId: string
  module: "hotel" | "flight" | "package" | "transfer" | "omra"
  source: "mygo" | "internal" | "amadeus" | "sabre" | "expedia" | "manual"
  
  // Données spécifiques au module
  moduleData: Record<string, any>
  
  // Prix
  originalCurrency: string
  originalAmount: number
  tndAmount: number
  depositAmount?: number
  
  // Dates
  checkIn?: Date
  checkOut?: Date
  
  // Métadonnées
  createdBy?: string
  metadata?: Record<string, any>
}

/**
 * Résultat d'une étape du workflow
 */
export interface WorkflowStepResult {
  success: boolean
  state: BookingWorkflowState
  data?: Record<string, any>
  error?: string
}

/**
 * Orchestrateur du workflow de réservation
 */
export class BookingWorkflowPipeline {
  private db: ReturnType<typeof getDb>
  private reservationId: string
  private agencyId: string

  constructor(reservationId: string, agencyId: string) {
    this.db = getDb()
    this.reservationId = reservationId
    this.agencyId = agencyId
  }

  /**
   * Étape 1 : Création de la réservation (Draft)
   */
  async createReservation(
    context: CreateReservationContext
  ): Promise<WorkflowStepResult> {
    try {
      return await this.db.transaction(async (tx) => {
        // Générer une référence publique
        const publicRef = await this.generatePublicRef(tx, context.agencyId)

        // Créer la réservation
        const reservation = await tx.insert(reservations).values({
          agencyId: context.agencyId,
          publicRef,
          customerId: context.customerId,
          module: context.module,
          source: context.source,
          status: "pending",
          originalCurrency: context.originalCurrency,
          originalAmount: context.originalAmount.toString(),
          tndAmount: context.tndAmount.toString(),
          depositAmount: context.depositAmount?.toString(),
          depositPaid: "0",
          notes: context.metadata?.notes,
        }).returning()

        this.reservationId = reservation[0].id

        // Log de transition de statut
        await tx.insert(reservationStatusHistory).values({
          reservationId: this.reservationId,
          toStatus: "pending",
          transition: "create",
          triggeredBy: context.createdBy,
          automated: true,
          reason: "Création de la réservation",
        })

        // Log d'audit (adapté au schéma existant)
        // TODO: Adapter après migration vers nouveau schéma auditLogs V6
        /*
        await tx.insert(auditLogs).values({
          agencyId: context.agencyId,
          entityType: "reservation",
          entityId: this.reservationId,
          action: "reservation.created",
          newValue: JSON.stringify({ ...context, publicRef }),
          description: `Création réservation ${publicRef}`,
          userId: context.createdBy,
        })
        */

        return {
          success: true,
          state: "draft",
          data: { reservationId: this.reservationId, publicRef },
        }
      })
    } catch (error) {
      return {
        success: false,
        state: "failed",
        error: error instanceof Error ? error.message : "Erreur création réservation",
      }
    }
  }

  /**
   * Étape 2 : Appel API fournisseur
   */
  async callProviderAPI(
    supplierId: string,
    apiPayload: Record<string, any>
  ): Promise<WorkflowStepResult> {
    try {
      return await this.db.transaction(async (tx) => {
        // Log de l'appel API
        const apiLog = await tx.insert(apiLogs).values({
          supplierId,
          operation: "book",
          module: "hotel", // À adapter selon le module
          requestPayload: JSON.stringify(apiPayload),
          requestUrl: "https://api.supplier.com/book",
          requestMethod: "POST",
          success: false,
          reservationId: this.reservationId,
        }).returning()

        // TODO: Effectuer l'appel API réel ici
        // const response = await fetch(...)
        // const responseData = await response.json()

        // Simulation pour l'instant
        const mockResponse = {
          success: true,
          supplierReference: `SUP-${Date.now()}`,
          confirmationId: `CONF-${Date.now()}`,
        }

        // Mettre à jour le log API
        await tx
          .update(apiLogs)
          .set({
            responsePayload: JSON.stringify(mockResponse),
            statusCode: 200,
            success: true,
            durationMs: 500,
          })
          .where(eq(apiLogs.id, apiLog[0].id))

        // Mettre à jour la réservation
        await tx
          .update(reservations)
          .set({
            status: "on_request",
            notes: `Réf fournisseur: ${mockResponse.supplierReference}`,
          })
          .where(eq(reservations.id, this.reservationId))

        // Log de transition
        await tx.insert(reservationStatusHistory).values({
          reservationId: this.reservationId,
          fromStatus: "pending",
          toStatus: "on_request",
          transition: "provider_confirm",
          automated: true,
          reason: "Confirmation fournisseur reçue",
        })

        return {
          success: true,
          state: "pending_provider",
          data: mockResponse,
        }
      })
    } catch (error) {
      return {
        success: false,
        state: "failed",
        error: error instanceof Error ? error.message : "Erreur appel API fournisseur",
      }
    }
  }

  /**
   * Étape 3 : Confirmation fournisseur (polling)
   */
  async confirmProvider(
    supplierReference: string
  ): Promise<WorkflowStepResult> {
    try {
      // TODO: Polling de confirmation auprès du fournisseur
      // Pour l'instant, simulation automatique

      await this.db.transaction(async (tx) => {
        await tx
          .update(reservations)
          .set({
            status: "confirmed",
          })
          .where(eq(reservations.id, this.reservationId))

        await tx.insert(reservationStatusHistory).values({
          reservationId: this.reservationId,
          fromStatus: "on_request",
          toStatus: "confirmed",
          transition: "provider_confirm",
          automated: true,
          reason: "Confirmation finale fournisseur",
        })
      })

      return {
        success: true,
        state: "provider_confirmed",
      }
    } catch (error) {
      return {
        success: false,
        state: "failed",
        error: error instanceof Error ? error.message : "Erreur confirmation fournisseur",
      }
    }
  }

  /**
   * Étape 4 : Débit wallet avec calcul de marge
   */
  async processPayment(
    marginContext: MarginCalculationContext,
    createdBy?: string
  ): Promise<WorkflowStepResult> {
    try {
      const result = await processReservationWithMargin(
        marginContext,
        this.reservationId,
        createdBy
      )

      if (!result.success) {
        return {
          success: false,
          state: "payment_failed",
          error: "Échec du traitement du paiement",
        }
      }

      await this.db.transaction(async (tx) => {
        await tx
          .update(reservations)
          .set({
            status: "confirmed",
            depositPaid: marginContext.supplierPrice.toString(),
          })
          .where(eq(reservations.id, this.reservationId))

        await tx.insert(reservationStatusHistory).values({
          reservationId: this.reservationId,
          fromStatus: "on_request",
          toStatus: "confirmed",
          transition: "payment_success",
          triggeredBy: createdBy,
          automated: false,
          reason: "Paiement validé",
        })
      })

      return {
        success: true,
        state: "confirmed",
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        state: "payment_failed",
        error: error instanceof Error ? error.message : "Erreur paiement",
      }
    }
  }

  /**
   * Étape 5 : Génération de facture
   */
  async generateInvoice(): Promise<WorkflowStepResult> {
    try {
      // TODO: Générer la facture PDF
      // await generateInvoicePDF(...)

      await this.db.transaction(async (tx) => {
        // Marquer la facture comme générée dans les notes
        await tx
          .update(reservations)
          .set({
            notes: sql`COALESCE(notes, '') || ' - Facture générée'`,
          })
          .where(eq(reservations.id, this.reservationId))
      })

      return {
        success: true,
        state: "confirmed",
        data: { invoiceGenerated: true },
      }
    } catch (error) {
      return {
        success: false,
        state: "failed",
        error: error instanceof Error ? error.message : "Erreur génération facture",
      }
    }
  }

  /**
   * Exécute le workflow complet
   */
  async executeFullWorkflow(
    createContext: CreateReservationContext,
    marginContext: MarginCalculationContext,
    supplierId: string,
    apiPayload: Record<string, any>,
    createdBy?: string
  ): Promise<WorkflowStepResult> {
    // Étape 1 : Création
    const step1 = await this.createReservation(createContext)
    if (!step1.success) return step1

    // Étape 2 : Appel API
    const step2 = await this.callProviderAPI(supplierId, apiPayload)
    if (!step2.success) return step2

    // Étape 3 : Confirmation
    const step3 = await this.confirmProvider(step2.data?.supplierReference)
    if (!step3.success) return step3

    // Étape 4 : Paiement
    const step4 = await this.processPayment(marginContext, createdBy)
    if (!step4.success) return step4

    // Étape 5 : Facture
    const step5 = await this.generateInvoice()
    if (!step5.success) return step5

    return {
      success: true,
      state: "confirmed",
      data: {
        reservationId: this.reservationId,
        ...step1.data,
        ...step2.data,
        ...step4.data,
        ...step5.data,
      },
    }
  }

  /**
   * Annule la réservation (rollback partiel)
   */
  async cancelReservation(reason: string, cancelledBy?: string): Promise<WorkflowStepResult> {
    try {
      await this.db.transaction(async (tx) => {
        // Mettre à jour le statut
        await tx
          .update(reservations)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
          })
          .where(eq(reservations.id, this.reservationId))

        // Log de transition
        await tx.insert(reservationStatusHistory).values({
          reservationId: this.reservationId,
          toStatus: "cancelled",
          transition: "cancel",
          triggeredBy: cancelledBy,
          automated: false,
          reason,
        })

        // Log d'audit (adapté au schéma existant)
        // TODO: Adapter après migration vers nouveau schéma auditLogs V6
        /*
        await tx.insert(auditLogs).values({
          agencyId: this.agencyId,
          entityType: "reservation",
          entityId: this.reservationId,
          action: "reservation.cancelled",
          description: `Annulation réservation: ${reason}`,
          userId: cancelledBy,
        })
        */

        // TODO: Rembourser le wallet si paiement effectué
        // await creditWallet(...)
      })

      return {
        success: true,
        state: "cancelled",
      }
    } catch (error) {
      return {
        success: false,
        state: "failed",
        error: error instanceof Error ? error.message : "Erreur annulation",
      }
    }
  }

  /**
   * Génère une référence publique unique
   */
  private async generatePublicRef(
    tx: any,
    agencyId: string
  ): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = agencyId.substring(0, 3).toUpperCase()

    // Récupérer le dernier numéro de séquence
    const result = await tx
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          sql`EXTRACT(YEAR FROM created_at) = ${year}`
        )
      )

    const sequence = (result[0]?.count || 0) + 1
    const sequenceStr = sequence.toString().padStart(6, "0")

    return `${prefix}-${year}-${sequenceStr}`
  }
}
