/**
 * GET /api/packages/voucher/[ref]
 *
 * Téléchargement du voucher PDF Voyage Organisé — même mécanisme que
 * `/api/booking/voucher/[ref]` (Hôtel) et `/api/omra/voucher/[ref]` (Omra) :
 * accès scopé par la connaissance de la référence publique, garde
 * `isPackageVoucherEligible` (jamais de voucher pour une réservation non
 * confirmée/payée).
 */

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, reservationPackage, catalogPackages, customers, agencies } from "@/lib/db/schema"
import { renderPackageVoucherPdf } from "@/lib/pdf/voucher-package"
import { isPackageVoucherEligible } from "@/lib/pro/voucher-eligibility"

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
        packageName: catalogPackages.title,
        departureDate: reservationPackage.departureDate,
        returnDate: reservationPackage.returnDate,
        adults: reservationPackage.adults,
        childrenAges: reservationPackage.childrenAges,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(reservationPackage, eq(reservationPackage.reservationId, reservations.id))
      .leftJoin(catalogPackages, eq(catalogPackages.id, reservationPackage.packageId))
      .where(eq(reservations.publicRef, ref))
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!isPackageVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "package"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher voyage organisé pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderPackageVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    packageName: row.packageName,
    departureDate: row.departureDate,
    returnDate: row.returnDate,
    adults: row.adults ?? 1,
    children: row.childrenAges?.length ?? 0,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-package-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
