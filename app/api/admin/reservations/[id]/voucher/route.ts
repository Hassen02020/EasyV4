/**
 * GET /api/admin/reservations/[id]/voucher
 *
 * Équivalent admin (Master Admin/back-office OTA) des routes guest
 * `/api/{module}/voucher/[ref]` — scopé par `getCurrentAdminProfile` : un
 * super_admin peut télécharger le voucher de N'IMPORTE QUELLE agence
 * (cross-tenant, `isSuperAdmin: true`) ; les autres rôles admin restent
 * scopés à leur propre agencyId (via RLS, `withTenantContext`), comme
 * partout ailleurs dans `/admin`.
 *
 * Dispatch par module via `renderReservationVoucher`
 * (lib/booking/reservation-voucher-render.ts) — avant ce fix, cette route
 * ne rendait QUE le module "hotel" (voir git blame), ce qui faisait
 * afficher "Non disponible pour ce module/statut" dans le bloc Voucher de
 * la page admin pour Omra/Package/Activité/Vols/Hôtels Monde même
 * confirmés (trouvé en certification E2E, cycle "Final Screenshot
 * Certification").
 */

import { NextRequest, NextResponse } from "next/server"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
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

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 })
  }

  const isSuperAdmin = profile.role === "super_admin"

  const result = await withTenantContext(
    { agencyId: isSuperAdmin ? null : profile.agencyId, userId: user.id, isSuperAdmin },
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
