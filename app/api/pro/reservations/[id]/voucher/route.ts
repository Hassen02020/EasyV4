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
import { and, eq } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, customers } from "@/lib/db/schema"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
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

  // `withTenantContext` scope déjà la lecture à `profile.agency.id` via RLS,
  // mais on filtre aussi explicitement `agencyId` dans la requête elle-même
  // (défense en profondeur, même pattern que
  // `lib/pro/reservation-detail.ts::loadReservationByRef`) — un partenaire
  // ne peut récupérer le voucher d'une réservation d'une autre agence ni
  // via RLS, ni via un id deviné/énuméré si jamais RLS venait à être
  // contourné (ex. rôle DB avec BYPASSRLS).
  const row = await withTenantContext(
    { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
    async (tx) => {
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
        })
        .from(reservations)
        .innerJoin(customers, eq(customers.id, reservations.customerId))
        .leftJoin(
          reservationHotel,
          eq(reservationHotel.reservationId, reservations.id),
        )
        .where(
          and(
            eq(reservations.id, reservationId),
            eq(reservations.agencyId, profile.agency.id),
          ),
        )
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
