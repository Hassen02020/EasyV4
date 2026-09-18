/**
 * app/robots.ts — PHASE PREMIUM 2, Chantier 4 (Pages Destination + SEO).
 *
 * Aucun robots.txt n'existait avant ce chantier. Autorise le storefront
 * public (`app/(public)/[locale]/**`), bloque tout le back-office et
 * l'infrastructure — mêmes segments que `app/(internal)/**`
 * (`lib/tenant/route-scope.ts::TENANT_EXEMPT_ROUTES`, élargi ici à
 * `/login`, `/unauthorized`, `/error` : ces 3 segments vivent aussi sous
 * `app/(internal)/**` mais ne sont pas dans la regex tenant, qui ne sert
 * qu'au routing tenant, pas au SEO) et `/api`, `/actions`.
 */

import type { MetadataRoute } from "next"
import { siteOrigin } from "@/lib/mygo/config"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/pro",
        "/b2b",
        "/mutuelle",
        "/login",
        "/unauthorized",
        "/error",
        "/api",
        "/actions",
      ],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  }
}
