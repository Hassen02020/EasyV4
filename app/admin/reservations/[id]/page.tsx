/**
 * /admin/reservations/[id] — Détail réservation, Master Admin.
 *
 * super_admin : accès cross-agence (isSuperAdmin: true, agencyId: null —
 * RLS autorise via is_super_admin(), même pattern que
 * lib/admin/reservations-data.ts::loadAllReservations).
 * manager / agent_resa / agent_compta / agent_excursions : scopés à leur
 * propre agencyId, comme le reste de `/admin`.
 */

import { redirect, notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { loadReservationDetail } from "@/lib/booking/reservation-detail"
import { ReservationDetailView } from "@/components/admin/reservation-detail-view"
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button"
import { RefundButton } from "@/components/admin/refund-button"
import { MANUAL_PAYMENT_ALLOWED_ROLES } from "@/lib/finance/manual-payment-logic"
import { REFUND_ALLOWED_ROLES } from "@/lib/finance/refund-logic"

export const dynamic = "force-dynamic"

export default async function AdminReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/reservations/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    redirect("/admin")
  }

  const isSuperAdmin = profile.role === "super_admin"

  const detail = await loadReservationDetail({
    reservationId: id,
    agencyId: isSuperAdmin ? null : profile.agencyId,
    isSuperAdmin,
  })

  if (!detail) notFound()

  const canVerifyPayment = (MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes(profile.role)
  const canRefund = (REFUND_ALLOWED_ROLES as readonly string[]).includes(profile.role)
  const defaultManualMethod = detail.payments.some((p) => p.method === "transfer") ? "transfer" : "cash"

  return (
    <ReservationDetailView
      detail={detail}
      showAgency
      voucherHref={`/api/admin/reservations/${detail.id}/voucher`}
      actions={
        <>
          {canVerifyPayment && detail.paymentSummary.remainingTnd > 0 ? (
            <VerifyPaymentButton
              reservationId={detail.id}
              defaultMethod={defaultManualMethod}
              remainingTnd={detail.paymentSummary.remainingTnd}
            />
          ) : null}
          {canRefund ? (
            <RefundButton reservationId={detail.id} refundableTnd={detail.paymentSummary.collectedTnd} />
          ) : null}
        </>
      }
    />
  )
}
