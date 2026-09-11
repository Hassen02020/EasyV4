"use server"

/**
 * Réservation Hôtels Monde B2C autonome (guest checkout).
 *
 * Même modèle d'identité que `lib/vols/guest-booking-actions.ts` : agence
 * OTA directe (`getDefaultAgencyId()`), aucune session partenaire requise,
 * "card" → `PaymentProvider` (aucun faux succès si non configuré),
 * "transfer"/"cash" → réservation réelle en attente, voucher/facture
 * différés à la confirmation du règlement.
 *
 * Différence structurelle avec Vols : contrairement à `reservationFlight`
 * (nouvelle table dédiée), Hôtels Monde réutilise la table d'extension
 * `reservationHotel` déjà existante (Hôtels Tunisie/myGo) — voir
 * drizzle/manual/0051_hotel_monde_module.sql pour la décision et ses
 * limites (`cityId` toujours NULL, `hotelId` synthétique dérivé de
 * l'`offerId` car le Virtual World Hotel Supplier n'a pas de catalogue
 * d'IDs numériques réel). `reservations.module` vaut `"hotel_monde"`,
 * jamais `"hotel"`, pour ne jamais confondre ces réservations avec celles
 * d'Hôtels Tunisie dans le back-office.
 *
 * Le flux suit le même patron que `lib/vols/guest-booking-actions.ts` :
 * `engine.book()` (revalidation prix + décrément d'inventaire + émission
 * du numéro de confirmation) est appelé AVANT la transaction DB ; tout
 * échec après ce point (paiement refusé, conflit d'idempotence) compense
 * en appelant `engine.cancel()` pour restituer l'inventaire réservé.
 *
 * Voucher/email : réutilise l'événement générique `"booking/confirmed"`
 * (déjà consommé par `lib/inngest/functions/process-confirmed-booking.ts`,
 * qui rend `lib/pdf/voucher-hotel.tsx`) — la forme des données d'une
 * réservation Hôtels Monde (hotelName/checkIn/checkOut/nights/adults/
 * children/totalTnd) est strictement identique à celle d'une réservation
 * Hôtel Tunisie, contrairement à Vols qui a nécessité un événement/gabarit
 * dédiés.
 */

import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { reservations, reservationHotel, payments, auditEvents } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { sendEvent } from "@/lib/inngest/client"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId, resolveOrCreateLinkedCustomer } from "@/lib/booking/customer-identity"
import { hashSeed } from "@/lib/hotels-monde/virtual-supplier/rng"
import { worldHotelGuestBookingSchema, type WorldHotelGuestBookingInput } from "./schemas"
import { book as bookWorldHotel, cancel as cancelWorldHotel, type BookResult } from "./virtual-supplier/engine"

export type WorldHotelGuestPaymentMethod = "card" | "transfer" | "cash"

export type CreateGuestWorldHotelBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
      confirmationNumber: string
    }
  | { ok: false; error: string; code?: string }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

/** Dérive un entier stable (>0) depuis l'`offerId` texte — `reservation_hotel.hotel_id`
 * est NOT NULL integer (catalogue myGo), sans équivalent réel pour un hôtel
 * international du Virtual World Hotel Supplier. */
function syntheticHotelId(offerId: string): number {
  return (hashSeed(offerId) % 2_000_000_000) + 1
}

/** Erreur typée — distingue un refus fournisseur/paiement (attendu) d'une vraie erreur interne. */
class BookingRejected extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const BOOK_ERROR_MESSAGES: Record<string, string> = {
  TOKEN_INVALID: "Cette offre est invalide — relancez une recherche.",
  TOKEN_EXPIRED: "Cette offre a expiré — relancez une recherche.",
  SOLD_OUT: "Cet hôtel n'a plus de chambres disponibles pour ces dates.",
}

export async function createGuestWorldHotelBooking(input: {
  booking: WorldHotelGuestBookingInput
  paymentMethod: WorldHotelGuestPaymentMethod
}): Promise<CreateGuestWorldHotelBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = worldHotelGuestBookingSchema.safeParse(input.booking)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  if (!["card", "transfer", "cash"].includes(input.paymentMethod)) {
    return { ok: false, error: "Mode de paiement invalide pour une réservation en ligne." }
  }

  // Clé d'idempotence dérivée du CONTENU (offre + email + mode de paiement)
  // — même principe que lib/vols/guest-booking-actions.ts. Un double-clic
  // soumet le même token, donc la même clé, et retombe sur le résultat déjà
  // produit sans réserver l'inventaire une seconde fois.
  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        offerToken: parsed.data.offerToken,
        paymentMethod: input.paymentMethod,
        guestEmail: parsed.data.guest.email,
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(parsed.data.guest.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestWorldHotelBooking(parsed.data, input.paymentMethod, linkedAuthUserId),
  )
}

async function runCreateGuestWorldHotelBooking(
  booking: WorldHotelGuestBookingInput,
  paymentMethod: WorldHotelGuestPaymentMethod,
  linkedAuthUserId: string | null,
): Promise<CreateGuestWorldHotelBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe n'est configurée pour le moment." }
  }

  const guest = booking.guest

  // --- Revalidation fournisseur RÉELLE (Virtual World Hotel Supplier) ---
  // Jamais de prix ni de disponibilité fournis par le client — book()
  // régénère l'offre déterministe et compare au prix attendu, décrémente
  // l'inventaire réel et n'émet un numéro de confirmation qu'en cas de succès.
  const bookResult: BookResult = await bookWorldHotel(booking.offerToken, booking.expectedPriceTnd)
  if (!bookResult.ok) {
    return {
      ok: false,
      error: BOOK_ERROR_MESSAGES[bookResult.kind] ?? bookResult.message,
      code: bookResult.kind,
    }
  }

  try {
    if (paymentMethod === "card") {
      const provider = getPaymentProvider()
      const paymentResult = await provider.createPayment({
        amountTnd: bookResult.totalPriceTnd,
        currency: "TND",
        reference: `guest-hotel-monde-${Date.now()}`,
        description: `Réservation hôtel — ${bookResult.name}`,
        customerEmail: guest.email,
      })
      if (!paymentResult.ok) {
        throw new BookingRejected(paymentResult.message ?? "Le paiement n'a pas pu être traité.", paymentResult.code)
      }
    }
    const isImmediatelyPaid = paymentMethod === "card"

    const result = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (tx) => {
      const customerId = await resolveOrCreateLinkedCustomer(tx, {
        agencyId,
        traveler: {
          civility: guest.civility,
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
          nationality: guest.nationality,
        },
        linkedAuthUserId,
      })

      const publicRef = await nextWorldHotelPublicRef(tx, agencyId)
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          publicRef,
          module: "hotel_monde",
          source: "internal",
          status: "pending",
          originalCurrency: "TND",
          originalAmount: String(bookResult.totalPriceTnd),
          tndAmount: String(bookResult.totalPriceTnd),
          depositAmount: String(bookResult.totalPriceTnd),
          depositPaid: "0",
          providerPayload: {
            offerId: bookResult.offerId,
            confirmationNumber: bookResult.confirmationNumber,
            destination: bookResult.destination,
            checkIn: bookResult.checkIn,
            checkOut: bookResult.checkOut,
            adults: bookResult.adults,
            rooms: bookResult.rooms,
            channel: "b2c_guest",
            paymentMethod,
            specialRequests: booking.specialRequests || null,
            // Consommé par app/booking/confirmation/[ref]/page.tsx (générique
            // tous modules) — mêmes clés que providerPayload.offerLabel/startDate
            // déjà utilisées par le tunnel hôtel/Omra/Package/Vols.
            offerLabel: bookResult.name,
            startDate: bookResult.checkIn,
          },
        })
        .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })
      const reservationId = reservation.id
      const guestAccessToken = reservation.guestAccessToken

      if (isImmediatelyPaid) {
        await tx
          .update(reservations)
          .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
          .where(eq(reservations.id, reservationId))
      }

      await tx.insert(payments).values({
        agencyId,
        reservationId,
        psp: "manual",
        method: paymentMethod,
        originalCurrency: "TND",
        originalAmount: bookResult.totalPriceTnd.toFixed(2),
        tndAmount: bookResult.totalPriceTnd.toFixed(2),
        kind: "deposit",
        status: isImmediatelyPaid ? "captured" : "pending",
        capturedAt: isImmediatelyPaid ? new Date() : undefined,
      })

      await tx.insert(reservationHotel).values({
        reservationId,
        agencyId,
        providerBookingId: bookResult.confirmationNumber,
        hotelId: syntheticHotelId(bookResult.offerId),
        hotelName: bookResult.name,
        cityId: null,
        cityName: bookResult.destination,
        checkIn: bookResult.checkIn,
        checkOut: bookResult.checkOut,
        nights: bookResult.nights,
        adults: bookResult.adults,
        childrenAges: [],
        boardName: bookResult.breakfastIncluded ? "Petit-déjeuner inclus" : undefined,
        rooms: [{ quantity: bookResult.rooms }],
        cancellationPolicies: { refundable: bookResult.refundable },
      })

      await tx.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: "hotel_monde_booking.created",
        diff: {
          offerId: bookResult.offerId,
          confirmationNumber: bookResult.confirmationNumber,
          name: bookResult.name,
          destination: bookResult.destination,
          totalTnd: bookResult.totalPriceTnd,
          publicRef,
          via: "b2c_guest",
          paymentMethod,
        },
      })

      return {
        reservationId,
        publicRef,
        guestAccessToken,
        status: (isImmediatelyPaid ? "confirmed" : "pending") as "confirmed" | "pending",
        contactEmail: guest.email,
        contactName: `${guest.firstName} ${guest.lastName}`.trim(),
        contactPhone: guest.phone,
      }
    })

    if (result.contactEmail) {
      await sendEvent("booking/confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId,
        guestAccessToken: result.guestAccessToken,
        customerEmail: result.contactEmail,
        customerName: result.contactName,
        customerPhone: result.contactPhone,
        hotelName: bookResult.name,
        checkIn: bookResult.checkIn,
        checkOut: bookResult.checkOut,
        nights: bookResult.nights,
        adults: bookResult.adults,
        children: 0,
        totalTnd: bookResult.totalPriceTnd,
      }).catch(() => {
        /* fire-and-forget */
      })
    }

    if (result.status === "confirmed") {
      try {
        const invoiceResult = await generateInvoiceForReservation({
          agencyId,
          reservationId: result.reservationId,
          actorUserId: "",
        })
        if (!invoiceResult.ok) {
          console.error("[hotel-monde-guest] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error(
          "[hotel-monde-guest] génération facture échouée",
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      status: result.status,
      confirmationNumber: bookResult.confirmationNumber,
    }
  } catch (err) {
    // Tout échec après bookWorldHotel() (paiement refusé, conflit DB) doit
    // restituer l'inventaire déjà réservé — même principe de compensation
    // que lib/vols/guest-booking-actions.ts.
    let compensationNote = ""
    try {
      await cancelWorldHotel({
        offerId: bookResult.offerId,
        checkIn: bookResult.checkIn,
        rooms: bookResult.rooms,
      })
    } catch {
      compensationNote = ` Réservation fournisseur ${bookResult.confirmationNumber} potentiellement toujours active — contactez le support immédiatement avec cette référence.`
    }
    if (err instanceof BookingRejected) {
      return { ok: false, error: `${err.message}${compensationNote}`, code: err.code }
    }
    console.error("[hotel-monde-guest] erreur interne", err instanceof Error ? err.message : String(err))
    return { ok: false, error: "Erreur interne lors de la création de la réservation." + compensationNote }
  }
}

async function nextWorldHotelPublicRef(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WH-${year}-`
  const { sql } = await import("drizzle-orm")
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(and(eq(reservations.agencyId, agencyId), sql`${reservations.publicRef} LIKE ${prefix + "%"}`))
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}
