/**
 * GET /api/pro/reservations/[id]/voucher
 *
 * Téléchargement à la demande du voucher PDF d'une réservation confirmée,
 * pour toute agence partenaire — dispatch par module via
 * `renderReservationVoucher` (lib/booking/reservation-voucher-render.ts),
 * même mécanisme que `/api/admin/reservations/[id]/voucher`. Avant ce fix,
 * cette route ne rendait QUE le module "hotel", ce qui faisait afficher
 * "Non disponible pour ce module/statut" dans le bloc Voucher de
 * `/pro/reservations/[id]` pour Omra/Package/Activité/Vols/Hôtels Monde
 * même confirmés (trouvé en certification E2E, cycle "Final Screenshot
 * Certification").
 *
 * Toujours scopé à `profile.agency.id` (RLS via `withTenantContext`,
 * jamais `isSuperAdmin: true` — cohérent avec le reste de `/pro`).
 */

import { NextRequest, NextResponse } from "next/server"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { createServerSupabase } from "@/lib/supabase/server"
import { renderReservationVoucher } from "@/lib/booking/reservation-voucher-render"

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
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const result = await withTenantContext(
    { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
    (tx) => renderReservationVoucher(tx, reservationId),
  )

  if (!result.ok) {
    return NextResponse.json(
      result.error === "not_found"
        ? { error: "not_found" }
        : { error: result.error, message: result.message },
      { status: result.status },
    )
  }

  return new NextResponse(Buffer.from(result.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
