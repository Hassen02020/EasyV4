import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { BookingsForm } from "./_bookings-form"

export default async function BookingsPage() {
  const tenant = await getRequestTenantInfo()
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null)
  return <BookingsForm supportPhone={contact?.contactPhone ?? null} />
}
