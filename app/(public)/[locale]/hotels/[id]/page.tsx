/**
 * Fiche hôtel — /hotels/[id].
 *
 * Enveloppe serveur (HOTEL-CONTACT-01) : lit les coordonnées de l'agence
 * courante (tenant White Label résolu par proxy.ts, sinon Easy2Book) comme
 * le header (components/header-wrapper.tsx), puis délègue l'affichage au
 * composant client existant. Seules des colonnes publiques sont lues.
 */
import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { HotelDetailClient } from "./hotel-detail-client"

interface DetailPageProps {
  params: Promise<{ id: string }>
}

export default async function HotelDetailPage({ params }: DetailPageProps) {
  const { id } = await params
  const tenant = await getRequestTenantInfo().catch(() => null)
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null).catch(
    () => null,
  )
  return (
    <HotelDetailClient
      id={id}
      agencyContact={{
        contactPhone: contact?.contactPhone ?? null,
        whatsappNumber: contact?.whatsappNumber ?? null,
      }}
    />
  )
}
