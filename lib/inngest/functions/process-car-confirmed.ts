/**
 * Inngest function — booking/car.confirmed
 *
 * Après création d'une réservation voiture (B2B immédiatement confirmée,
 * B2C guest en attente) :
 *  1. Génère le PDF Voucher Voiture via @react-pdf/renderer.
 *  2. Envoie l'email client avec le voucher en PJ via Resend.
 *  3. Enregistre l'idempotence pour éviter les doubles envois (retries Inngest).
 *
 * CAR-VOUCHER-01 — premier déclencheur voiture ; pattern identique à
 * process-confirmed-booking.ts (hôtel) et process-transfer-confirmed.ts.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { renderCarVoucherPdf } from "@/lib/pdf/voucher-car"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  auditEvents,
  notificationIdempotency,
  reservations,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { pgErrorCode } from "@/lib/db/pg-error"
import { Resend } from "resend"

const ACTION_CAR_VOUCHER_SENT = "notification.car_voucher_email.sent"

async function hasCarVoucherAlreadySent(
  reservationId: string,
): Promise<boolean> {
  const [existing] = await withSystemContext((db) =>
    db
      .select({ id: notificationIdempotency.id })
      .from(notificationIdempotency)
      .where(
        and(
          eq(notificationIdempotency.reservationId, reservationId),
          eq(notificationIdempotency.action, ACTION_CAR_VOUCHER_SENT),
        ),
      )
      .limit(1),
  )
  return Boolean(existing)
}

async function recordCarVoucherSent(
  agencyId: string,
  reservationId: string,
  publicRef: string,
): Promise<void> {
  try {
    await withSystemContext((db) =>
      db.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: ACTION_CAR_VOUCHER_SENT,
        diff: { publicRef },
      }),
    )
  } catch (err) {
    if (pgErrorCode(err) === "23505") return
    throw err
  }
  try {
    await withSystemContext((db) =>
      db.insert(notificationIdempotency).values({
        agencyId,
        reservationId,
        action: ACTION_CAR_VOUCHER_SENT,
        context: { publicRef },
      }),
    )
  } catch (err) {
    if (pgErrorCode(err) === "23505") return
    throw err
  }
}

export const processCarConfirmed = inngest.createFunction(
  {
    id: "process-car-confirmed",
    name: "Location Voiture — PDF Voucher + Email",
    retries: 3,
    triggers: { event: "booking/car.confirmed" },
    onFailure: makeOnFailure("process-car-confirmed"),
  },
  async ({
    event,
  }: {
    event: { data: Events["booking/car.confirmed"]["data"] }
  }) => {
    const d = event.data

    if (!d.customerEmail) {
      return {
        skipped: true,
        reason: "no_customer_email",
        reservationId: d.reservationId,
      }
    }

    if (await hasCarVoucherAlreadySent(d.reservationId)) {
      return {
        success: true,
        reservationId: d.reservationId,
        publicRef: d.publicRef,
        alreadySent: true,
      }
    }

    const buffer = await renderCarVoucherPdf({
      publicRef: d.publicRef,
      customerName: d.customerName,
      categoryName: d.categoryName,
      pickupLocationName: d.pickupLocationName,
      dropoffLocationName: d.dropoffLocationName,
      pickupAt: d.pickupAt,
      dropoffAt: d.dropoffAt,
      rentalDays: d.rentalDays,
      insuranceLevel: d.insuranceLevel,
      totalTnd: d.totalTnd,
    })
    const pdfBase64 = Buffer.from(buffer).toString("base64")

    if (!process.env.RESEND_API_KEY) {
      return {
        skipped: true,
        reason: "resend_not_configured",
        reservationId: d.reservationId,
      }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const confirmationLink = d.guestAccessToken
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://easy2book.tn"}/booking/confirmation/${d.publicRef}?token=${d.guestAccessToken}`
      : null

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #D62828;">Votre réservation voiture est confirmée !</h2>
        <p>Bonjour <strong>${d.customerName}</strong>,</p>
        <p>Votre réservation de location de voiture a bien été enregistrée.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #f9fafb;">
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Référence</td>
            <td style="padding: 8px 12px; font-weight: bold;">${d.publicRef}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Véhicule</td>
            <td style="padding: 8px 12px;">${d.categoryName}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Prise en charge</td>
            <td style="padding: 8px 12px;">${d.pickupLocationName} — ${new Date(d.pickupAt).toLocaleString("fr-FR")}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Retour</td>
            <td style="padding: 8px 12px;">${d.dropoffLocationName} — ${new Date(d.dropoffAt).toLocaleString("fr-FR")}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Durée</td>
            <td style="padding: 8px 12px;">${d.rentalDays} jour${d.rentalDays > 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #6b7280; font-size: 13px;">Total</td>
            <td style="padding: 8px 12px; font-weight: bold; color: #D62828;">${d.totalTnd.toLocaleString("fr-FR")} DT</td>
          </tr>
        </table>
        ${confirmationLink ? `<p><a href="${confirmationLink}" style="color: #D62828;">Voir ma réservation</a></p>` : ""}
        <p>Le voucher PDF est joint à cet email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">L'équipe Easy2Book</p>
      </div>
    `

    const { error } = await resend.emails.send({
      from: "Easy2Book <noreply@easy2book.tn>",
      to: d.customerEmail,
      subject: `Votre voucher location voiture — ${d.categoryName} (${d.publicRef})`,
      html,
      attachments: [
        {
          filename: `voucher-${d.publicRef}.pdf`,
          content: pdfBase64,
        },
      ],
    })

    if (error) {
      throw new Error(`Resend error: ${error.message}`)
    }

    await withSystemContext((db) =>
      db
        .update(reservations)
        .set({ updatedAt: new Date() })
        .where(eq(reservations.id, d.reservationId)),
    )

    await recordCarVoucherSent(d.agencyId, d.reservationId, d.publicRef)

    return {
      success: true,
      reservationId: d.reservationId,
      publicRef: d.publicRef,
    }
  },
)
