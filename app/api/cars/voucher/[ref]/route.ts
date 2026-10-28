/**
 * GET /api/cars/voucher/[ref]
 *
 * Téléchargement du voucher PDF Voiture — même mécanisme que
 * `app/api/omra/voucher/[ref]/route.ts` (VOUCHER-CAR-TRANSFER-DATA-01,
 * lot "car"). Utilise `isCarVoucherEligible` (jamais de voucher pour une
 * réservation non confirmée/payée).
 *
 * `?token=` (`guestAccessToken`) est OBLIGATOIRE — même invariant sécurité
 * que les autres routes voucher guest (Phase 21.1 / TG-2026-000123) :
 * `publicRef` seul est séquentiel/devinable, le token lie la requête à
 * CETTE réservation précise (jointure WHERE publicRef= AND guestAccessToken=,
 * jamais une recherche par publicRef seul puis une vérification séparée).
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationCar,
  carCategories,
  carLocations,
  customers,
  agencies,
} from "@/lib/db/schema"
import { renderCarVoucherPdf } from "@/lib/pdf/voucher-car"
import { isCarVoucherEligible } from "@/lib/pro/voucher-eligibility"

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

  const pickupLocation = alias(carLocations, "pickup_location")
  const dropoffLocation = alias(carLocations, "dropoff_location")

  const row = await withSystemContext(async (tx) => {
    const [r] = await tx
      .select({
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        tndAmount: reservations.tndAmount,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        categoryName: carCategories.name,
        pickupLocationName: pickupLocation.name,
        dropoffLocationName: dropoffLocation.name,
        pickupAt: reservationCar.pickupAt,
        dropoffAt: reservationCar.dropoffAt,
        rentalDays: reservationCar.rentalDays,
        insuranceLevel: reservationCar.insuranceLevel,
        agencyName: agencies.name,
        agencyBrandName: agencies.brandName,
      })
      .from(reservations)
      .innerJoin(customers, eq(customers.id, reservations.customerId))
      .innerJoin(agencies, eq(agencies.id, reservations.agencyId))
      .leftJoin(
        reservationCar,
        eq(reservationCar.reservationId, reservations.id),
      )
      .leftJoin(carCategories, eq(carCategories.id, reservationCar.categoryId))
      .leftJoin(
        pickupLocation,
        eq(pickupLocation.id, reservationCar.pickupLocationId),
      )
      .leftJoin(
        dropoffLocation,
        eq(dropoffLocation.id, reservationCar.dropoffLocationId),
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
  if (!isCarVoucherEligible(row)) {
    return NextResponse.json(
      {
        error: "voucher_unavailable",
        message:
          row.module === "car"
            ? "Le voucher n'est disponible qu'une fois la réservation confirmée."
            : "Aucun voucher Voiture pour cette réservation.",
      },
      { status: 404 },
    )
  }

  const pdf = await renderCarVoucherPdf({
    publicRef: row.publicRef,
    customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
    categoryName: row.categoryName,
    pickupLocationName: row.pickupLocationName,
    dropoffLocationName: row.dropoffLocationName,
    pickupAt: row.pickupAt!.toISOString(),
    dropoffAt: row.dropoffAt!.toISOString(),
    rentalDays: row.rentalDays ?? 1,
    insuranceLevel: row.insuranceLevel ?? "basic",
    totalTnd: parseFloat(row.tndAmount),
    agencyName: row.agencyBrandName ?? row.agencyName,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="voucher-car-${row.publicRef}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
