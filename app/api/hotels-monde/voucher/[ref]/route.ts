/**
 * GET /api/hotels-monde/voucher/[ref]
 *
 * Téléchargement du voucher PDF Hôtels Monde — même mécanisme que
 * `/api/vols/voucher/[ref]` (Vols) / `/api/booking/voucher/[ref]` (Hôtels
 * Tunisie), garde `isWorldHotelVoucherEligible` (jamais de voucher pour une
 * réservation non confirmée/payée). `?token=` (`guestAccessToken`)
 * obligatoire — même frontière d'accès Phase 21.1 (P0-1) que les autres
 * routes voucher guest.
 *
 * Route dédiée plutôt qu'une extension de `/api/booking/voucher/[ref]` :
 * même table d'extension `reservationHotel` réutilisée (voir
 * drizzle/manual/0051_hotel_monde_module.sql), mais un module distinct
 * (`"hotel_monde"` vs `"hotel"`) — zéro risque de régression sur le module
 * Hôtels Tunisie déjà certifié. Réutilise directement `renderVoucherPdf`
 * (lib/pdf/voucher-hotel.tsx) : `VoucherData` est déjà générique, aucun
 * nouveau gabarit PDF nécessaire.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, customers, agencies } from "@/lib/db/schema"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { isWorldHotelVoucherEligible } from "@/lib/pro/voucher-eligibility"

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
  if (!isWorldHotelVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "hotel_monde"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher Hôtels Monde pour cette réservation.",
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
      "Content-Disposition": `attachment; filename="voucher-hotel-monde-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
