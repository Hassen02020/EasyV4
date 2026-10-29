/**
 * GET /api/transfers/voucher/[ref]
 *
 * Téléchargement du voucher PDF Transfert — même mécanisme que
 * `app/api/cars/voucher/[ref]/route.ts` (VOUCHER-CAR-TRANSFER-DATA-01, lot
 * "transfer"). Utilise `isTransferVoucherEligible` (jamais de voucher pour une
 * réservation non confirmée/payée, ni pour un transfert sans heure de prise
 * en charge enregistrée).
 *
 * `?token=` (`guestAccessToken`) est OBLIGATOIRE — `publicRef` seul est
 * séquentiel/devinable, le token lie la requête à CETTE réservation précise
 * (jointure WHERE publicRef= AND guestAccessToken=).
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationTransfer,
  customers,
  agencies,
} from "@/lib/db/schema"
import { renderTransferVoucherPdf } from "@/lib/pdf/voucher-transfer"
import { isTransferVoucherEligible } from "@/lib/pro/voucher-eligibility"

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
        fromZone: reservationTransfer.pickupAddress,
        toZone: reservationTransfer.dropoffAddress,
        pickupAt: reservationTransfer.pickupAt,
        vehicleType: reservationTransfer.vehicleType,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(
        reservationTransfer,
        eq(reservationTransfer.reservationId, reservations.id),
      )
      .where(
        and(
          eq(reservations.publicRef, ref),
          eq(reservations.guestAccessToken, token),
        ),
      )
      .limit(1)
    return r ?? null
  })

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!isTransferVoucherEligible(row) || !row.vehicleType) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "transfer"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher Transfert pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderTransferVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    fromZone: row.fromZone,
    toZone: row.toZone,
    pickupAt: row.pickupAt.toISOString(),
    vehicleType: row.vehicleType,
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-transfert-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
