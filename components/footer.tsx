import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { FooterClient } from "@/components/footer-client"

/**
 * Server wrapper : résout le tenant White Label (proxy.ts → getRequestTenantInfo(),
 * même source que components/header-wrapper.tsx) puis délègue le rendu au
 * client component. Garde le nom/l'import `Footer` inchangé pour les ~28
 * pages qui l'utilisent déjà — aucun call site à modifier.
 */
export async function Footer() {
  const tenant = await getRequestTenantInfo()
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null)
  return (
    <FooterClient
      brandName={tenant?.brandName ?? null}
      logoUrl={tenant?.logoUrl ?? null}
      contactPhone={contact?.contactPhone ?? null}
      whatsappNumber={contact?.whatsappNumber ?? null}
      facebookUrl={contact?.facebookUrl ?? null}
      instagramUrl={contact?.instagramUrl ?? null}
      tiktokUrl={contact?.tiktokUrl ?? null}
      address={contact?.address ?? null}
    />
  )
}
