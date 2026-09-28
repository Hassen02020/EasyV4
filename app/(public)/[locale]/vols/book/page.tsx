/**
 * /vols/book — redirected.
 *
 * This route was the original B2C booking page (offerToken approach).
 * The funnel now goes directly from search results to /vols/passengers
 * (snapshotId approach). Redirect to /vols so stale links don't 404.
 */

import { redirect } from "@/i18n/navigation"
import { getLocale } from "next-intl/server"

export default async function VolsBookPage() {
  const locale = await getLocale()
  redirect({ href: "/vols", locale })
}
