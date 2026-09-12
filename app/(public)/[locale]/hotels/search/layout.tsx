import type { Metadata } from "next"

import { getTranslations } from "next-intl/server"

import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

/**
 * `page.tsx` de cette route est un Client Component ("use client", widget de
 * recherche/filtrage interactif) — un Server Component ne peut pas exporter
 * `metadata`/`generateMetadata` depuis un fichier client, d'où ce layout
 * dédié, seul responsable des métadonnées de `/hotels/search` (gap confirmé
 * lot 3 : cette page n'avait aucune metadata). Aucune logique de recherche
 * ici, juste le `<head>`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Hotels")

  return {
    title: t("searchMetaTitle"),
    description: t("searchMetaDescription"),
    alternates: { languages: buildLanguageAlternates("/hotels/search") },
  }
}

export default function HotelsSearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
