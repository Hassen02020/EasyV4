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
  /** Vol confirmé — déclenche génération billet + email. */
  "booking/flight.confirmed": {
    data: {
      reservationId: string
      publicRef: string
      agencyId: string
      customerEmail: string
      customerName: string
      origin: string
      destination: string
      departureAt: string
      carrier: string
      flightNumber: string
      adults: number
      children: number
      totalTnd: number
    }
  }
  /** Transfert confirmé — déclenche SMS chauffeur + email client. */
  "booking/transfer.confirmed": {
    data: {
      reservationId: string
      publicRef: string
      agencyId: string
      customerEmail: string
      customerPhone: string
      fromZone: string
      toZone: string
      pickupAt: string
      vehicleType: string
      totalTnd: number
    }
  }
  /** Omra confirmée — déclenche génération dossier visa + email. */
  "booking/omra.confirmed": {
    data: {
      reservationId: string
      publicRef: string
      agencyId: string
      packageName: string
      pilgrimsCount: number
      departureDate: string
      totalTnd: number
      contactEmail: string
    }
  }
}

export const inngest = new Inngest({ id: "easy2book" })

/**
 * Helper de typage fort pour inngest.send().
 * Utiliser à la place de inngest.send() directement pour bénéficier
 * de l'autocomplete et de la vérification des payloads.
 *
 * ```ts
 * await sendEvent("booking/confirmed", { reservationId: "...", ... })
 * ```
 */
export async function sendEvent<K extends keyof Events>(
  name: K,
  data: Events[K]["data"],
) {
  return inngest.send({ name: name as string, data })
}
