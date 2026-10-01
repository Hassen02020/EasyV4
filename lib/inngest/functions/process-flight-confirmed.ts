/**
 * Inngest function — booking/flight.confirmed
 *
 * Après confirmation d'une réservation Vol :
 *   1. Génère le PDF voucher vol via @react-pdf/renderer
 *   2. Envoie l'email client avec le voucher en PJ via Resend
 *   3. Marque l'envoi dans audit_events (idempotence — même patron que hotel)
 */

import { eq, and } from "drizzle-orm"
import { Resend } from "resend"
import { inngest, type Events } from "@/lib/inngest/client"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { renderFlightVoucherPdf } from "@/lib/pdf/voucher-flight"
import type { FlightVoucherData } from "@/lib/pdf/voucher-flight"
import { withSystemContext } from "@/lib/db/tenant-context"
import { flightBookings } from "@/lib/db/schema/flights"
import { auditEvents } from "@/lib/db/schema"
import { pgErrorCode } from "@/lib/db/pg-error"
import type { CanonicalItinerary } from "@/lib/vols/canonical"

const ACTION_FLIGHT_VOUCHER_SENT = "notification.flight_voucher_email.sent"

async function hasFlightVoucherAlreadySent(reservationId: string): Promise<boolean> {
  const [existing] = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "reservation"),
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, ACTION_FLIGHT_VOUCHER_SENT),
        ),
      )
      .limit(1),
  )
  return Boolean(existing)
}

async function recordFlightVoucherSent(
  agencyId: string,
  reservationId: string,
  publicRef: string,
): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: ACTION_FLIGHT_VOUCHER_SENT,
        diff: { publicRef },
      }),
    )
  } catch (err) {
    if (pgErrorCode(err) === "23505") return
    throw err
  }
}

export const processFlightConfirmed = inngest.createFunction(
  {
    id: "process-flight-confirmed",
    name: "Vol confirmé — PDF + email",
    retries: 3,
    triggers: { event: "booking/flight.confirmed" },
    onFailure: makeOnFailure("process-flight-confirmed"),
  },
  async ({
    event,
  }: {
    event: { data: Events["booking/flight.confirmed"]["data"] }
  }) => {
    const d = event.data

    if (await hasFlightVoucherAlreadySent(d.reservationId)) {
      return { reservationId: d.reservationId, skipped: true }
    }

    // Load PNR and itinerary from flight_bookings
    const [booking] = (await withSystemContext((tx) =>
      tx
        .select({ pnr: flightBookings.pnr, itinerary: flightBookings.itinerary })
        .from(flightBookings)
        .where(eq(flightBookings.reservationId, d.reservationId))
        .limit(1),
    )) as Array<{ pnr: string | null; itinerary: unknown }>

    const itinerary = (booking?.itinerary ?? {}) as CanonicalItinerary
    const firstJourney = itinerary.journeys?.[0]
    const firstSeg = firstJourney?.segments?.[0]
    const lastJourney = itinerary.journeys?.[itinerary.journeys.length - 1] ?? firstJourney
    const lastSeg = lastJourney?.segments?.[lastJourney.segments.length - 1]

    const voucherData: FlightVoucherData = {
      publicRef: d.publicRef,
      customerName: d.customerName,
      pnr: booking?.pnr ?? null,
      origin: d.origin,
      destination: d.destination,
      departAt: d.departureAt,
      arriveAt: lastSeg?.arrival ?? null,
      carrier: d.carrier || null,
      flightNumber: d.flightNumber || null,
      cabinClass: firstSeg?.cabin ?? null,
      adults: d.adults,
      children: d.children,
      totalTnd: d.totalTnd,
    }

    const pdfBuf = await renderFlightVoucherPdf(voucherData, "fr")
    const pdfBase64 = Buffer.from(pdfBuf).toString("base64")

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({
        from: "Easy2Book Vols <vols@easy2book.tn>",
        to: d.customerEmail,
        subject: `Votre billet de vol ${d.publicRef} — ${d.origin} → ${d.destination}`,
        html: `
          <h2>Votre réservation de vol est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Vol :</strong> ${d.origin} → ${d.destination} (${d.carrier}${d.flightNumber})</p>
          <p><strong>Départ :</strong> ${new Date(d.departureAt).toLocaleString("fr-FR")}</p>
          <p><strong>Passagers :</strong> ${d.adults + d.children}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <p>Votre voucher de vol est joint à cet email.</p>
          <hr/>
          <p>Easy2Book Vols</p>
        `,
        attachments: [
          {
            filename: `voucher-vol-${d.publicRef}.pdf`,
            content: pdfBase64,
          },
        ],
      })
      if (error) {
        throw new Error(
          `[process-flight-confirmed] envoi email échoué — ${error.message} (ref: ${d.publicRef})`,
        )
      }
    }

    await recordFlightVoucherSent(d.agencyId, d.reservationId, d.publicRef)
    return { reservationId: d.reservationId }
  },
)
