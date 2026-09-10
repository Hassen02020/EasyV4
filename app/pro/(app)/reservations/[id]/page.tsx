/**
 * /pro/reservations/[id] — Détail réservation, agence partenaire.
 *
 * Toujours scopé à `profile.agency.id` (jamais cross-tenant, jamais de
 * `isSuperAdmin: true` même en mode "vue B2B simulée" — un super_admin qui
 * visite /pro reste explicitement dans l'agence qu'il consulte).
 * Vue en lecture seule : la vérification de paiement manuel et le
 * remboursement restent des actions Master Admin uniquement (même
 * restriction déjà en place sur `verifyManualPayment`/`refundReservation`
 * côté serveur — voir MANUAL_PAYMENT_ALLOWED_ROLES / REFUND_ALLOWED_ROLES).
 */

import { redirect, notFound } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { loadReservationDetail } from "@/lib/booking/reservation-detail"
import { ReservationDetailView } from "@/components/admin/reservation-detail-view"
import { isHotelReservationVoucherEligible } from "@/lib/pro/voucher-eligibility"

export const dynamic = "force-dynamic"

export default async function PartnerReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/pro/login?next=/pro/reservations/${id}`)

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) redirect("/admin")

  const detail = await loadReservationDetail({
    reservationId: id,
    agencyId: profile.agency.id,
    isSuperAdmin: false,
  })

  if (!detail) notFound()

  const voucherHref = isHotelReservationVoucherEligible(detail.module, detail.status)
    ? `/api/pro/reservations/${detail.id}/voucher`
    : null
  const invoiceHref = `/api/pro/reservations/${detail.id}/invoice`

  return <ReservationDetailView detail={detail} voucherHref={voucherHref} invoiceHref={invoiceHref} />
}
