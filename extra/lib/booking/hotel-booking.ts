/**
 * Gestion des Réservations d'Hôtels
 *
 * Ce module implémente la logique complète de réservation d'hôtels avec :
 *  - Vérification du solde Wallet (Anti-Solde < 0)
 *  - Écriture polymorphique dans les tables reservations + reservation_hotel
 *  - Mouvement comptable immuable dans wallet_ledger
 *  - Transaction SQL atomique (tout ou rien)
 *
 * Utilisation :
 *  import { createHotelBooking } from "@/lib/booking/hotel-booking"
 *  const result = await createHotelBooking({ ... })
 */

"use server"

import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationHotel,
  agencyWallets,
  walletLedger,
  customers,
} from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

/**
 * Interface pour les données de réservation d'hôtel
 */
export interface CreateHotelBookingInput {
  // Informations client
  customerId: string
  agencyId: string
  
  // Informations hôtel
  hotelId: number
  hotelName: string
  cityId?: number
  cityName?: string
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  nights: number
  
  // Passagers
  adults: number
  childrenAges?: number[]
  
  // Tarification
  originalCurrency: string
  originalAmount: number // Prix d'achat fournisseur
  tndAmount: number // Prix de vente en TND (avec marge)
  
  // Détails réservation
  boardCode?: string
  boardName?: string
  rooms?: any // JSON des chambres
  providerToken?: string
  
  // Optionnel
  notes?: string
}

/**
 * Résultat de la création de réservation
 */
export interface BookingResult {
  success: boolean
  reservationId?: string
  publicRef?: string
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
 * Crée une réservation d'hôtel avec vérification du solde et transaction atomique
 *
 * Processus :
 *  1. Vérifier le solde disponible de l'agence
 *  2. Créer la réservation (table centrale)
 *  3. Créer les détails hôtel (table d'extension)
 *  4. Débiter le wallet
 *  5. Enregistrer le mouvement dans le ledger
 *
 * Tout est exécuté dans une transaction SQL atomique.
 */
export async function createHotelBooking(
  input: CreateHotelBookingInput,
): Promise<BookingResult> {
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
          module: "hotel",
          source: "mygo",
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

      // 2.2 Créer les détails hôtel (table d'extension)
      await tx.insert(reservationHotel).values({
        reservationId: reservation.id,
        agencyId: input.agencyId,
        providerToken: input.providerToken,
        hotelId: input.hotelId,
        hotelName: input.hotelName,
        cityId: input.cityId,
        cityName: input.cityName,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: input.nights,
        adults: input.adults,
        childrenAges: input.childrenAges || [],
        boardCode: input.boardCode,
        boardName: input.boardName,
        rooms: input.rooms,
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
        description: `Achat Hôtel - ${input.hotelName} (${input.checkIn} - ${input.checkOut})`,
      })

      return {
        reservationId: reservation.id,
        publicRef: reservation.publicRef,
      }
    })

    return {
      success: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
    }
  } catch (error) {
    console.error("Erreur lors de la création de la réservation:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
      errorCode: "BOOKING_FAILED",
    }
  }
}

/**
 * Annule une réservation et rembourse le wallet
 *
 * Processus :
 *  1. Vérifier que la réservation existe et est annulable
 *  2. Mettre à jour le statut de la réservation
 *  3. Créditer le wallet (remboursement)
 *  4. Enregistrer le mouvement dans le ledger
 */
export async function cancelHotelBooking(
  reservationId: string,
  agencyId: string,
  reason?: string,
): Promise<BookingResult> {
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
        description: `Remboursement annulation réservation ${reservationId}`,
      })
    })

    return {
      success: true,
      reservationId,
    }
  } catch (error) {
    console.error("Erreur lors de l'annulation de la réservation:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
      errorCode: "CANCELLATION_FAILED",
    }
  }
}
