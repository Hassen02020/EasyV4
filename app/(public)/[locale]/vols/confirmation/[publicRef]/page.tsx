/**
 * /vols/confirmation/[publicRef] — replaced.
 *
 * The flight B2C funnel now redirects to the shared token-gated page
 * /booking/confirmation/[ref]?token= which handles voucher download,
 * invoice, and payment summary for all modules including flights.
 *
 * Old direct links (no token) will land on 404 from the shared page —
 * correct, since publicRef alone was guessable (sequential).
 */

import { redirect } from "@/i18n/navigation"
import { getLocale } from "next-intl/server"

interface Props {
  params: Promise<{ publicRef: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function FlightConfirmationLegacyPage({ params, searchParams }: Props) {
  const { publicRef } = await params
  const { token } = await searchParams
  const locale = await getLocale()

  if (token) {
    redirect({ href: `/booking/confirmation/${publicRef}?token=${token}`, locale })
  }
  redirect({ href: "/vols", locale })
}
