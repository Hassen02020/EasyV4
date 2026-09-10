/**
 * GET /api/booking/voucher/[ref]
 *
 * Téléchargement du voucher PDF pour le tunnel B2C public (`/booking/*`),
 * guest ou partenaire. Même mécanisme que
 * `app/api/pro/reservations/[id]/voucher/route.ts` (Phase 11 :
 * `isVoucherEligible`, jamais de voucher pour une réservation non
 * confirmée), mais accessible SANS session — le client final n'a pas de
 * compte partenaire à présenter.
 *
 * Phase 21.1 (P0-1) : `publicRef` (séquentiel/devinable) seul n'est PLUS
 * la frontière d'accès — `?token=` (`reservations.guestAccessToken`,
 * privé, aléatoire, jamais dérivable de `publicRef`) est désormais
 * OBLIGATOIRE et vérifié dans la MÊME requête. `withSystemContext()`
 * reste nécessaire (route sans session), mais c'est le token qui protège,
 * pas le ref.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, customers, agencies } from "@/lib/db/schema"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { isVoucherEligible } from "@/lib/pro/voucher-eligibility"

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
        hotelName: reservationHotel.hotelName,
        checkIn: reservationHotel.checkIn,
        checkOut: reservationHotel.checkOut,
        nights: reservationHotel.nights,
        adults: reservationHotel.adults,
        childrenAges: reservationHotel.childrenAges,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
      .where(and(eq(reservations.publicRef, ref), eq(reservations.guestAccessToken, token)))
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!isVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "hotel"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher hôtel pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    hotelName: row.hotelName,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    nights: row.nights ?? 1,
    adults: row.adults ?? 1,
    children: row.childrenAges?.length ?? 0,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
