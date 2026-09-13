import type { Metadata } from "next"

import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"

const DEFAULT_TITLE = "Easy2Book — Centrale de Réservation : Vols, Hôtels, Omra & Voyages"
const DEFAULT_DESCRIPTION =
  "Easy2Book — Centrale de réservation : vols, hôtels en Tunisie et dans le monde, voyages organisés, Omra, transferts et location de voiture. Support local 7j/7 — +216 98 140 514."

// Favicon/icônes : `agencies` n'a aucune colonne favicon (schema vérifié) —
// toujours le fallback Easy2Book, tenant ou non (pas de fonctionnalité à
// inventer ici).
const ICONS: Metadata["icons"] = {
  icon: [
    { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
    { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
    { url: "/icon.svg", type: "image/svg+xml" },
  ],
  apple: "/apple-icon.png",
}

/**
 * Métadonnées dynamiques par tenant White Label (brandName → title/description/OG)
 * — voir proxy.ts + lib/tenant/current-tenant.ts. Fallback Easy2Book si aucun
 * tenant résolu. Partagée par les deux root layouts (public et internal) —
 * extraite tel quelle de l'ancien `app/layout.tsx` unique (aucun changement
 * de logique, seulement de l'infra de routing autour).
 */
export async function buildSiteMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenantInfo()
  const brandName = tenant?.brandName ?? null
  const title = brandName ? `${brandName} — Centrale de Réservation en ligne` : DEFAULT_TITLE
  const description = brandName
    ? `${brandName} — Réservez vols, hôtels, Omra, voyages organisés et transferts en ligne.`
    : DEFAULT_DESCRIPTION

  return {
    title,
    description,
    manifest: "/manifest.json",
    icons: ICONS,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brandName ?? "Easy2Book",
    },
    openGraph: {
      title,
      description,
      siteName: brandName ?? "Easy2Book",
      images: tenant?.logoUrl ? [{ url: tenant.logoUrl }] : undefined,
    },
  }
}
