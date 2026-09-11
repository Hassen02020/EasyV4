"use server"

/**
 * Réservation Vols B2C autonome (guest checkout).
 *
 * Même modèle d'identité que `lib/omra/guest-booking-actions.ts` : agence
 * OTA directe (`getDefaultAgencyId()`), aucune session partenaire requise,
 * "card" → `PaymentProvider` (aucun faux succès si non configuré),
 * "transfer"/"cash" → réservation réelle en attente, voucher/facture
 * différés à la confirmation du règlement.
 *
 * Différence structurelle avec Omra/Package/Activity : il n'existe pas
 * d'allotement local à verrouiller — la disponibilité et le prix sont
 * détenus par un "fournisseur" externe simulé (Virtual Flight Supplier,
 * lib/vols/virtual-supplier/engine.ts), exactement comme myGo pour l'hôtel.
 * Le flux suit donc le même patron que `lib/booking/guest-actions.ts` :
 * `engine.book()` (revalidation prix + décrément d'inventaire + émission
 * PNR) est appelé AVANT la transaction DB ; tout échec après ce point
 * (paiement refusé, conflit d'idempotence) compense en appelant
 * `engine.cancel()` pour restituer l'inventaire réservé.
 *
 * Limitation documentée (Virtual Flight Supplier V1) : seuls les vols
 * aller-simple sont réellement modélisés — un `returnDate` peut être transmis
 * à la recherche mais aucune offre de retour n'est générée par
 * `lib/vols/virtual-supplier/catalog.ts`. Cette Server Action n'enregistre
 * donc jamais de segment retour (`returnOrigin`/`returnDepartAt`/... restent
 * `null`), pour ne jamais laisser croire à une réservation aller-retour qui
 * n'a jamais été émise par le fournisseur.
 */

import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { reservations, reservationFlight, payments, auditEvents } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { sendEvent } from "@/lib/inngest/client"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId, resolveOrCreateLinkedCustomer } from "@/lib/booking/customer-identity"
import { flightGuestBookingSchema, type FlightGuestBookingInput } from "./schemas"
import { book as bookFlight, cancel as cancelFlight, type BookResult } from "./virtual-supplier/engine"

export type FlightGuestPaymentMethod = "card" | "transfer" | "cash"

export type CreateGuestFlightBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
      pnr: string
    }
  | { ok: false; error: string; code?: string }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
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
  SOLD_OUT: "Cette offre n'est plus disponible.",
}

export async function createGuestFlightBooking(input: {
  booking: FlightGuestBookingInput
  paymentMethod: FlightGuestPaymentMethod
}): Promise<CreateGuestFlightBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = flightGuestBookingSchema.safeParse(input.booking)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  if (!["card", "transfer", "cash"].includes(input.paymentMethod)) {
    return { ok: false, error: "Mode de paiement invalide pour une réservation en ligne." }
  }

  // Clé d'idempotence dérivée du CONTENU (offre + passeports + mode de
  // paiement) — même principe que lib/omra/guest-booking-actions.ts. Un
  // double-clic soumet le même token, donc la même clé, et retombe sur le
  // résultat déjà produit sans réserver l'inventaire une seconde fois.
  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        offerToken: parsed.data.offerToken,
        paymentMethod: input.paymentMethod,
        passports: parsed.data.travelers.map((t) => t.passportNumber),
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(parsed.data.travelers[0]?.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestFlightBooking(parsed.data, input.paymentMethod, linkedAuthUserId),
  )
}

async function runCreateGuestFlightBooking(
  booking: FlightGuestBookingInput,
  paymentMethod: FlightGuestPaymentMethod,
  linkedAuthUserId: string | null,
): Promise<CreateGuestFlightBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe n'est configurée pour le moment." }
  }

  const firstTraveler = booking.travelers[0]!

  // --- Revalidation fournisseur RÉELLE (Virtual Flight Supplier) ---
  // Jamais de prix ni de disponibilité fournis par le client — book()
  // régénère l'offre déterministe et compare au prix attendu, décrémente
  // l'inventaire réel et n'émet un PNR qu'en cas de succès.
  const bookResult: BookResult = await bookFlight(booking.offerToken, booking.expectedPriceTnd)
  if (!bookResult.ok) {
    return {
      ok: false,
      error: BOOK_ERROR_MESSAGES[bookResult.kind] ?? bookResult.message,
      code: bookResult.kind,
    }
  }

  if (booking.travelers.length !== bookResult.adults + bookResult.children) {
    // Défense en profondeur : ne devrait jamais arriver si l'UI construit le
    // formulaire à partir du même offerToken, mais un décompte incohérent
    // ne doit jamais créer une réservation à moitié remplie — restitue
    // l'inventaire déjà réservé par bookFlight() avant de rejeter.
    await cancelFlight({
      offerId: bookResult.offerId,
      departureDate: bookResult.departureDate,
      adults: bookResult.adults,
      children: bookResult.children,
    })
    return {
      ok: false,
      error: "Le nombre de voyageurs ne correspond pas au nombre de passagers de cette offre.",
      code: "TRAVELER_COUNT_MISMATCH",
    }
  }

  try {
    if (paymentMethod === "card") {
      const provider = getPaymentProvider()
      const paymentResult = await provider.createPayment({
        amountTnd: bookResult.totalPriceTnd,
        currency: "TND",
        reference: `guest-flight-${Date.now()}`,
        description: `Réservation vol — ${bookResult.origin} → ${bookResult.destination}`,
        customerEmail: firstTraveler.email || "",
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
          firstName: firstTraveler.firstName,
          lastName: firstTraveler.lastName,
          email: firstTraveler.email || "",
          phone: firstTraveler.phone,
          civicId: firstTraveler.passportNumber,
          civicIdType: "passport",
          birthDate: firstTraveler.birthDate,
          nationality: firstTraveler.nationality,
        },
        linkedAuthUserId,
      })

      const publicRef = await nextFlightPublicRef(tx, agencyId)
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          publicRef,
          module: "flight",
          source: "internal",
          status: "pending",
          originalCurrency: "TND",
          originalAmount: String(bookResult.totalPriceTnd),
          tndAmount: String(bookResult.totalPriceTnd),
          depositAmount: String(bookResult.totalPriceTnd),
          depositPaid: "0",
          providerPayload: {
            offerId: bookResult.offerId,
            pnr: bookResult.pnr,
            origin: bookResult.origin,
            destination: bookResult.destination,
            departureDate: bookResult.departureDate,
            adults: bookResult.adults,
            children: bookResult.children,
            channel: "b2c_guest",
            paymentMethod,
            // Consommé par app/booking/confirmation/[ref]/page.tsx (générique
            // tous modules) — mêmes clés que providerPayload.offerLabel/startDate
            // déjà utilisées par le tunnel hôtel/Omra/Package.
            offerLabel: `Vol ${bookResult.origin} → ${bookResult.destination}`,
            startDate: bookResult.departureDate,
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

      const firstSegment = bookResult.segments[0]!
      const lastSegment = bookResult.segments[bookResult.segments.length - 1]!
      await tx.insert(reservationFlight).values({
        reservationId,
        agencyId,
        pnr: bookResult.pnr,
        origin: bookResult.origin,
        destination: bookResult.destination,
        departAt: new Date(firstSegment.departureAt),
        arriveAt: new Date(lastSegment.arrivalAt),
        cabinClass: firstSegment.cabin,
        adults: bookResult.adults,
        children: bookResult.children,
        infants: 0,
        segments: bookResult.segments,
      })

      await tx.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: "flight_booking.created",
        diff: {
          offerId: bookResult.offerId,
          pnr: bookResult.pnr,
          origin: bookResult.origin,
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
        contactEmail: firstTraveler.email,
        contactName: `${firstTraveler.firstName} ${firstTraveler.lastName}`.trim(),
      }
    })

    if (result.contactEmail) {
      await sendEvent("booking/flight.confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId,
        customerEmail: result.contactEmail,
        customerName: result.contactName,
        origin: bookResult.origin,
        destination: bookResult.destination,
        departureAt: bookResult.segments[0]!.departureAt,
        carrier: bookResult.segments[0]!.carrier,
        flightNumber: bookResult.segments[0]!.flightNumber,
        adults: bookResult.adults,
        children: bookResult.children,
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
          console.error("[flight-guest] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error("[flight-guest] génération facture échouée", err instanceof Error ? err.message : String(err))
      }
    }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      status: result.status,
      pnr: bookResult.pnr,
    }
  } catch (err) {
    // Tout échec après bookFlight() (paiement refusé, conflit DB) doit
    // restituer l'inventaire déjà réservé — même principe de compensation
    // que confirmHotelWithProvider()/cancelBooking() côté myGo.
    let compensationNote = ""
    try {
      await cancelFlight({
        offerId: bookResult.offerId,
        departureDate: bookResult.departureDate,
        adults: bookResult.adults,
        children: bookResult.children,
      })
    } catch {
      compensationNote = ` Réservation fournisseur ${bookResult.pnr} potentiellement toujours active — contactez le support immédiatement avec cette référence.`
    }
    if (err instanceof BookingRejected) {
      return { ok: false, error: `${err.message}${compensationNote}`, code: err.code }
    }
    console.error("[flight-guest] erreur interne", err instanceof Error ? err.message : String(err))
    return { ok: false, error: "Erreur interne lors de la création de la réservation." + compensationNote }
  }
}

async function nextFlightPublicRef(tx: DrizzleTransaction, agencyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `FL-${year}-`
  const { sql } = await import("drizzle-orm")
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(and(eq(reservations.agencyId, agencyId), sql`${reservations.publicRef} LIKE ${prefix + "%"}`))
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}
