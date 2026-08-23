/**
 * GET /api/admin/reservations/[id]/voucher
 *
 * Équivalent admin (Master Admin/back-office OTA) de
 * `/api/pro/reservations/[id]/voucher` — même rendu (`renderVoucherPdf`,
 * `isVoucherEligible`), mais scopé par `getCurrentAdminProfile` : un
 * super_admin peut télécharger le voucher de N'IMPORTE QUELLE agence
 * (cross-tenant, `isSuperAdmin: true`) ; les autres rôles admin restent
 * scopés à leur propre agencyId, comme partout ailleurs dans `/admin`.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, customers } from "@/lib/db/schema"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { createServerSupabase } from "@/lib/supabase/server"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { isVoucherEligible } from "@/lib/pro/voucher-eligibility"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reservationId } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const isSuperAdmin = profile.role === "super_admin"

  const row = await withTenantContext(
    { agencyId: isSuperAdmin ? null : profile.agencyId, userId: user.id, isSuperAdmin },
    async (tx) => {
      const whereClause = isSuperAdmin
        ? eq(reservations.id, reservationId)
        : and(eq(reservations.id, reservationId), eq(reservations.agencyId, profile.agencyId))
      const [r] = await tx
        .select({
          publicRef: reservations.publicRef,
          module: reservations.module,
          status: reservations.status,
          tndAmount: reservations.tndAmount,
          agencyId: reservations.agencyId,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          hotelName: reservationHotel.hotelName,
          checkIn: reservationHotel.checkIn,
          checkOut: reservationHotel.checkOut,
          nights: reservationHotel.nights,
          adults: reservationHotel.adults,
          childrenAges: reservationHotel.childrenAges,
        })
        .from(reservations)
        .innerJoin(customers, eq(customers.id, reservations.customerId))
        .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
        .where(whereClause)
        .limit(1)
      return r ?? null
    },
  )

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
    agencyName: "Easy2Book",
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
