/**
 * Inngest client singleton — Easy2Book.
 *
 * Events déclarés ici pour typage fort. Chaque fonction Inngest écoute
 * un (ou plusieurs) de ces événements et s'exécute de manière asynchrone,
 * en arrière-plan, sans bloquer la réponse HTTP (évite les timeouts Vercel).
 */

import { Inngest } from "inngest"

export type Events = {
  /** Réservation confirmée — déclenche génération PDF + envoi email. */
  "booking/confirmed": {
    data: {
      reservationId: string
      publicRef: string
      agencyId: string
      customerEmail: string
      customerName: string
      hotelName: string
      checkIn: string
      checkOut: string
      nights: number
      adults: number
      children: number
      totalTnd: number
    }
  }
  /** Wallet crédité (top-up validé) — déclenche notification agence. */
  "wallet/credited": {
    data: {
      agencyId: string
      txId: string
      amount: number
      newBalance: number
      method: string
      adminUserId: string
    }
  }
}

export const inngest = new Inngest({
  id: "easy2book",
  schemas: new Map() as never, // satisfait le type sans EventSchemas
})
