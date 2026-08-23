/**
 * GET /api/omra/voucher/[ref]
 *
 * Téléchargement du voucher PDF Omra — même mécanisme que
 * `app/api/booking/voucher/[ref]/route.ts` (Hôtel). Utilise
 * `isOmraVoucherEligible` (jamais de voucher pour une réservation
 * non confirmée/payée), la variante Omra du garde Phase 11.
 *
 * Phase 21.1 (P0-1) : `publicRef` seul n'est plus la frontière d'accès —
 * `?token=` (`guestAccessToken`) est désormais obligatoire, voir
 * `app/api/booking/voucher/[ref]/route.ts` pour le détail du correctif.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationOmra, omraPackages, customers, agencies } from "@/lib/db/schema"
import { renderOmraVoucherPdf } from "@/lib/pdf/voucher-omra"
import { isOmraVoucherEligible } from "@/lib/pro/voucher-eligibility"

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
        packageName: omraPackages.name,
        departureDate: reservationOmra.departureDate,
        returnDate: reservationOmra.returnDate,
        pilgrims: reservationOmra.pilgrims,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(reservationOmra, eq(reservationOmra.reservationId, reservations.id))
      .leftJoin(omraPackages, eq(omraPackages.id, reservationOmra.omraPackageId))
      .where(and(eq(reservations.publicRef, ref), eq(reservations.guestAccessToken, token)))
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!isOmraVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "omra"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher Omra pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderOmraVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    packageName: row.packageName,
    departureDate: row.departureDate,
    returnDate: row.returnDate,
    pilgrimsCount: row.pilgrims ?? 1,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-omra-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
