/**
 * Gestion des Réservations de Vols
 *
 * Ce module implémente la logique complète de réservation de vols avec :
 *  - Vérification du solde Wallet (Anti-Solde < 0)
 *  - Écriture polymorphique dans les tables reservations + reservation_flight
 *  - Mouvement comptable immuable dans wallet_ledger
 *  - Transaction SQL atomique (tout ou rien)
 *  - Émission de billets et notifications (via BullMQ)
 *
 * Utilisation :
 *  import { createFlightBooking } from "@/lib/booking/flight-booking"
 *  const result = await createFlightBooking({ ... })
 */

"use server"

import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationFlight,
  agencyWallets,
  walletLedger,
} from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

/**
 * Interface pour un passager
 */
export interface Passenger {
  type: "adult" | "child" | "infant"
  title: "mr" | "mrs" | "ms" | "miss"
  firstName: string
  lastName: string
  dateOfBirth: string // YYYY-MM-DD
  passportNumber?: string
  passportExpiry?: string
  nationality?: string
}

/**
 * Interface pour les données de réservation de vol
 */
export interface CreateFlightBookingInput {
  // Informations client
  customerId: string
  agencyId: string
  
  // Informations vol
  flightId: string
  pnr: string // Passenger Name Record
  airline: string // Code IATA (ex: TU)
  airlineName: string
  flightNumber: string
  
  // Itinéraire
  origin: string // Code IATA aéroport
  originName: string
  destination: string // Code IATA aéroport
  destinationName: string
  departureDate: string // YYYY-MM-DD
  departureTime: string // ISO 8601
  arrivalTime: string // ISO 8601
  returnDate?: string // Pour aller-retour
  
  // Passagers
  passengers: Passenger[]
  adults: number
  children: number
  infants: number
  
  // Tarification
  originalCurrency: string
  originalAmount: number // Prix d'achat fournisseur
  tndAmount: number // Prix de vente en TND (avec marge)
  
  // Détails réservation
  cabinClass: string // economy, business, first
  bookingClass: string // Code de réservation (Y, C, F)
  baggageAllowance?: any // JSON
  fareRules?: string
  
  // Optionnel
  notes?: string
}

/**
 * Résultat de la création de réservation
 */
export interface FlightBookingResult {
  success: boolean
  reservationId?: string
  publicRef?: string
  pnr?: string
  error?: string
  errorCode?: string
}

/**
 * Génère une référence publique unique pour la réservation
 * Format: TG-YYYY-NNNNNN
 */
function generatePublicRef(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0")
  return `TG-${year}-${random}`
}

/**
 * Crée une réservation de vol avec vérification du solde et transaction atomique
 *
 * Processus :
 *  1. Vérifier le solde disponible de l'agence
 *  2. Créer la réservation (table centrale)
 *  3. Créer les détails vol (table d'extension)
 *  4. Débiter le wallet
 *  5. Enregistrer le mouvement dans le ledger
 *  6. Déclencher l'émission du billet (BullMQ - à implémenter)
 *
 * Tout est exécuté dans une transaction SQL atomique.
 */
export async function createFlightBooking(
  input: CreateFlightBookingInput,
): Promise<FlightBookingResult> {
  const db = getDb()

  try {
    // 1. Vérifier le solde disponible (Sécurité Anti-Solde < 0)
    const [wallet] = await db
      .select({
        id: agencyWallets.id,
        balance: agencyWallets.balance,
        frozenBalance: agencyWallets.frozenBalance,
      })
      .from(agencyWallets)
      .where(eq(agencyWallets.agencyId, input.agencyId))
      .limit(1)

    if (!wallet) {
      return {
        success: false,
        error: "Wallet non trouvé pour cette agence",
        errorCode: "WALLET_NOT_FOUND",
      }
    }

    const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.frozenBalance)

    if (availableBalance < input.tndAmount) {
      return {
        success: false,
        error: `Solde insuffisant. Disponible: ${availableBalance.toFixed(2)} TND, Requis: ${input.tndAmount.toFixed(2)} TND`,
        errorCode: "INSUFFICIENT_BALANCE",
      }
    }

    // 2. Exécuter la transaction atomique
    const result = await db.transaction(async (tx) => {
      // 2.1 Créer la réservation centrale
      const publicRef = generatePublicRef()
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId: input.agencyId,
          publicRef,
          customerId: input.customerId,
          module: "flight",
          source: "internal", // GDS interne
          status: "confirmed",
          originalCurrency: input.originalCurrency,
          originalAmount: input.originalAmount.toString(),
          tndAmount: input.tndAmount.toString(),
          depositAmount: "0",
          depositPaid: "0",
          notes: input.notes,
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })

      if (!reservation) {
        throw new Error("Échec de création de la réservation")
      }

      // 2.2 Créer les détails vol (table d'extension)
      await tx.insert(reservationFlight).values({
        reservationId: reservation.id,
        agencyId: input.agencyId,
        pnr: input.pnr,
        airline: input.airline,
        airlineName: input.airlineName,
        flightNumber: input.flightNumber,
        origin: input.origin,
        originName: input.originName,
        destination: input.destination,
        destinationName: input.destinationName,
        departureDate: input.departureDate,
        departureTime: input.departureTime,
        arrivalTime: input.arrivalTime,
        returnDate: input.returnDate,
        adults: input.adults,
        children: input.children,
        infants: input.infants,
        passengers: input.passengers,
        cabinClass: input.cabinClass,
        bookingClass: input.bookingClass,
        baggageAllowance: input.baggageAllowance,
        fareRules: input.fareRules,
      })

      // 2.3 Débiter le wallet
      await tx
        .update(agencyWallets)
        .set({
          balance: sql`${agencyWallets.balance} - ${input.tndAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(agencyWallets.id, wallet.id))

      // 2.4 Enregistrer le mouvement dans le ledger (immuable)
      await tx.insert(walletLedger).values({
        walletId: wallet.id,
        reservationId: reservation.id,
        transactionType: "debit",
        amount: input.tndAmount.toString(),
        description: `Achat Billet Vol ${input.airline}${input.flightNumber} - ${input.origin} → ${input.destination} (${input.departureDate})`,
      })

      return {
        reservationId: reservation.id,
        publicRef: reservation.publicRef,
        pnr: input.pnr,
      }
    })

    // TODO: Déclencher l'émission du billet via BullMQ
    // await queueTicketIssuance(result.reservationId, result.pnr)
    // await queueConfirmationEmail(input.customerId, result.publicRef)
    // await queueConfirmationSMS(input.customerId, result.publicRef)

    return {
      success: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      pnr: result.pnr,
    }
  } catch (error) {
    console.error("Erreur lors de la création de la réservation de vol:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
      errorCode: "BOOKING_FAILED",
    }
  }
}

/**
 * Annule une réservation de vol et rembourse le wallet
 *
 * Processus :
 *  1. Vérifier que la réservation existe et est annulable
 *  2. Mettre à jour le statut de la réservation
 *  3. Créditer le wallet (remboursement)
 *  4. Enregistrer le mouvement dans le ledger
 *  5. Annuler le billet auprès de la compagnie (via GDS)
 */
export async function cancelFlightBooking(
  reservationId: string,
  agencyId: string,
  reason?: string,
): Promise<FlightBookingResult> {
  const db = getDb()

  try {
    // Vérifier que la réservation existe
    const [reservation] = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        tndAmount: reservations.tndAmount,
        agencyId: reservations.agencyId,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1)

    if (!reservation) {
      return {
        success: false,
        error: "Réservation non trouvée",
        errorCode: "RESERVATION_NOT_FOUND",
      }
    }

    if (reservation.agencyId !== agencyId) {
      return {
        success: false,
        error: "Accès non autorisé à cette réservation",
        errorCode: "UNAUTHORIZED",
      }
    }

    if (reservation.status === "cancelled" || reservation.status === "refunded") {
      return {
        success: false,
        error: "Réservation déjà annulée",
        errorCode: "ALREADY_CANCELLED",
      }
    }

    // Récupérer le wallet
    const [wallet] = await db
      .select({ id: agencyWallets.id })
      .from(agencyWallets)
      .where(eq(agencyWallets.agencyId, agencyId))
      .limit(1)

    if (!wallet) {
      return {
        success: false,
        error: "Wallet non trouvé",
        errorCode: "WALLET_NOT_FOUND",
      }
    }

    // Transaction atomique
    await db.transaction(async (tx) => {
      // Mettre à jour le statut
      await tx
        .update(reservations)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          notes: reason ? `Annulation: ${reason}` : undefined,
        })
        .where(eq(reservations.id, reservationId))

      // Créditer le wallet (remboursement)
      await tx
        .update(agencyWallets)
        .set({
          balance: sql`${agencyWallets.balance} + ${parseFloat(reservation.tndAmount)}`,
          updatedAt: new Date(),
        })
        .where(eq(agencyWallets.id, wallet.id))

      // Enregistrer le mouvement dans le ledger
      await tx.insert(walletLedger).values({
        walletId: wallet.id,
        reservationId: reservationId,
        transactionType: "credit",
        amount: reservation.tndAmount,
        description: `Remboursement annulation vol ${reservationId}`,
      })
    })

    // TODO: Annuler le billet auprès du GDS
    // await gdsClient.cancelTicket(pnr)

    return {
      success: true,
      reservationId,
    }
  } catch (error) {
    console.error("Erreur lors de l'annulation de la réservation de vol:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
      errorCode: "CANCELLATION_FAILED",
    }
  }
}
