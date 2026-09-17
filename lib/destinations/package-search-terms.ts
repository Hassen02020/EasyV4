/**
 * `destinations.slug` (module `packages_slug`, chantier 3) → terme de
 * recherche dans `catalog_packages.title`. Extrait de
 * `lib/destinations/cross-sell.ts` dans son propre fichier — zéro import
 * (contrairement à `cross-sell.ts`, qui tire `lib/agencies/default-agency.ts`
 * et son `import "server-only"`) — pour rester testable directement par
 * `node:test` sans passer par le bundler Next.js. Partagé avec
 * `app/(public)/[locale]/packages/page.tsx`.
 */
export const PACKAGE_DESTINATION_SEARCH_TERMS: Record<string, string> = {
  istanbul: "Istanbul",
  dubai: "Dubai",
  paris: "Paris",
  rome: "Rome",
  barcelona: "Barcelone",
  london: "Londres",
  cairo: "Caire",
  casablanca: "Casablanca",
}
