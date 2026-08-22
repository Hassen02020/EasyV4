/**
 * GET /api/activities/voucher/[ref]
 *
 * Téléchargement du voucher PDF Attraction — même mécanisme que
 * `/api/packages/voucher/[ref]`/`/api/omra/voucher/[ref]` : accès scopé
 * par la connaissance de la référence publique, garde
 * `isActivityVoucherEligible` (jamais de voucher pour une réservation non
 * confirmée/payée).
 */

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationActivity, catalogActivities, customers, agencies } from "@/lib/db/schema"
import { renderActivityVoucherPdf } from "@/lib/pdf/voucher-activity"
import { isActivityVoucherEligible } from "@/lib/pro/voucher-eligibility"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select({
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        tndAmount: reservations.tndAmount,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        activityName: catalogActivities.title,
        sessionDate: reservationActivity.sessionDate,
        sessionStart: reservationActivity.sessionStart,
        sessionEnd: reservationActivity.sessionEnd,
        adults: reservationActivity.adults,
        children: reservationActivity.children,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(reservationActivity, eq(reservationActivity.reservationId, reservations.id))
      .leftJoin(catalogActivities, eq(catalogActivities.id, reservationActivity.activityId))
      .where(eq(reservations.publicRef, ref))
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!isActivityVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "activity"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher attraction pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderActivityVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    activityName: row.activityName,
    sessionDate: row.sessionDate,
    sessionStart: row.sessionStart,
    sessionEnd: row.sessionEnd,
    adults: row.adults ?? 1,
    children: row.children ?? 0,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-activity-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
