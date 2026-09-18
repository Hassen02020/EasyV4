/**
 * GET /api/vols/voucher/[ref]
 *
 * Téléchargement du voucher PDF Vol — même mécanisme que
 * `/api/packages/voucher/[ref]` (Voyage Organisé) / `/api/omra/voucher/[ref]`,
 * garde `isFlightVoucherEligible` (jamais de voucher pour une réservation
 * non confirmée/payée). `?token=` (`guestAccessToken`) obligatoire — même
 * frontière d'accès Phase 21.1 (P0-1) que les autres routes voucher guest.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationFlight, customers, agencies } from "@/lib/db/schema"
import { renderFlightVoucherPdf } from "@/lib/pdf/voucher-flight"
import { isFlightVoucherEligible } from "@/lib/pro/voucher-eligibility"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params
  const token = req.nextUrl.searchParams.get("token")

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }
  if (!token) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
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
        pnr: reservationFlight.pnr,
        origin: reservationFlight.origin,
        destination: reservationFlight.destination,
        departAt: reservationFlight.departAt,
        arriveAt: reservationFlight.arriveAt,
        cabinClass: reservationFlight.cabinClass,
        adults: reservationFlight.adults,
        children: reservationFlight.children,
        segments: reservationFlight.segments,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(reservationFlight, eq(reservationFlight.reservationId, reservations.id))
      .where(and(eq(reservations.publicRef, ref), eq(reservations.guestAccessToken, token)))
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (
    !isFlightVoucherEligible({
      module: row.module,
      status: row.status,
      origin: row.origin,
      destination: row.destination,
      departAt: row.departAt ? row.departAt.toISOString() : null,
    })
  ) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "flight"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher vol pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const firstSegment = (row.segments as Array<{ carrier?: string; flightNumber?: string }> | null)?.[0]

  const pdf = await renderFlightVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    pnr: row.pnr,
    origin: row.origin!,
    destination: row.destination!,
    departAt: row.departAt!.toISOString(),
    arriveAt: row.arriveAt ? row.arriveAt.toISOString() : null,
    carrier: firstSegment?.carrier ?? null,
    flightNumber: firstSegment?.flightNumber ?? null,
    cabinClass: row.cabinClass,
    adults: row.adults ?? 1,
    children: row.children ?? 0,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-vol-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
