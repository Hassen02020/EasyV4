import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
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
  return (
    <FooterClient
      brandName={tenant?.brandName ?? null}
      logoUrl={tenant?.logoUrl ?? site?.logoUrl ?? null}
      contactEmail={site?.contactEmail ?? null}
      contactPhone={site?.contactPhone ?? null}
      address={site?.address ?? null}
      facebookUrl={site?.facebookUrl ?? null}
      instagramUrl={site?.instagramUrl ?? null}
      tiktokUrl={site?.tiktokUrl ?? null}
    />
  )
}
