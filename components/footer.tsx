import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { FooterClient } from "@/components/footer-client"
import { getPublicSiteConfig } from "@/lib/public/site-content"

/**
 * Server wrapper : résout le tenant White Label (proxy.ts → getRequestTenantInfo(),
 * même source que components/header-wrapper.tsx) puis délègue le rendu au
 * client component. Garde le nom/l'import `Footer` inchangé pour les ~28
 * pages qui l'utilisent déjà — aucun call site à modifier.
 */
export async function Footer() {
  const tenant = await getRequestTenantInfo()
  const site = await getPublicSiteConfig()
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null)
  return (
    <FooterClient
      brandName={tenant?.brandName ?? null}
      logoUrl={tenant?.logoUrl ?? site?.logoUrl ?? null}
      contactEmail={site?.contactEmail ?? null}
      contactPhone={contact?.contactPhone ?? site?.contactPhone ?? null}
      whatsappNumber={contact?.whatsappNumber ?? null}
      facebookUrl={contact?.facebookUrl ?? site?.facebookUrl ?? null}
      instagramUrl={contact?.instagramUrl ?? site?.instagramUrl ?? null}
      tiktokUrl={contact?.tiktokUrl ?? site?.tiktokUrl ?? null}
      address={contact?.address ?? site?.address ?? null}
    />
  )
}
