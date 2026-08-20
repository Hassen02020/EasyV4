/**
 * GET /api/pro/reservations/[id]/voucher
 *
 * Téléchargement à la demande du voucher PDF d'une réservation hôtel
 * confirmée — jusqu'ici, le seul rendu du voucher (`renderVoucherPdf`,
 * `lib/pdf/voucher-hotel.tsx`) se produisait une seule fois, en tâche de
 * fond (`processConfirmedBooking`), pour l'envoyer par email — jamais
 * stocké nulle part (`reservations.voucherUrl` existe en base mais n'est
 * jamais rempli), donc aucun bouton "Télécharger" ne pouvait fonctionner
 * même s'il avait été câblé.
 *
 * `renderVoucherPdf` est pure/déterministe pour les mêmes données : on la
 * ré-invoque simplement à la demande à partir des données déjà stockées de
 * la réservation, sans avoir besoin d'un stockage de fichier séparé.
 */

import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, customers } from "@/lib/db/schema"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { createServerSupabase } from "@/lib/supabase/server"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"

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

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    )
  }

  // `withTenantContext` scope la lecture à `profile.agency.id` — un
  // partenaire ne peut jamais récupérer le voucher d'une réservation
  // appartenant à une autre agence, quel que soit l'id fourni dans l'URL.
  const row = await withTenantContext(
    { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
    async (tx) => {
      const [r] = await tx
        .select({
          publicRef: reservations.publicRef,
          module: reservations.module,
          tndAmount: reservations.tndAmount,
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
        .leftJoin(
          reservationHotel,
          eq(reservationHotel.reservationId, reservations.id),
        )
        .where(eq(reservations.id, reservationId))
        .limit(1)
      return r ?? null
    },
  )

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (row.module !== "hotel" || !row.hotelName || !row.checkIn || !row.checkOut) {
    return NextResponse.json(
      { error: "voucher_unavailable", message: "Aucun voucher hôtel pour cette réservation." },
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
    agencyName: profile.agency.brandName ?? profile.agency.name,
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
