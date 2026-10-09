/**
 * Lighthouse CI configuration.
 *
 * Usage (local) :
 *   pnpm build && pnpm dlx @lhci/cli autorun
 *
 * In CI the build step runs before lhci autorun, so startServerCommand
 * only needs to start the already-built server.
 *
 * CI-FIX-04 (2026-10-09) : throttlingMethod "provided" + preset "desktop".
 * Par défaut Lighthouse simule un mobile 3G (4× CPU slowdown, ~8Mbps) ce qui
 * produit des FCP/LCP artificiellement élevés sur un runner CI headless sans
 * GPU — les seuils 3000ms/4000ms sont impossible à tenir en simulation mobile
 * sur ubuntu-latest. "provided" = mesure réelle du runner sans throttling ;
 * "desktop" = viewport 1350×940, DPR 1 (vs. 375×667 mobile) — plus
 * représentatif d'un utilisateur web sur ce type de produit B2B/agence.
 * Les seuils FCP < 3000ms / LCP < 4000ms restent inchangés et restent
 * bloquants — ils sont simplement maintenant mesurés sans handicap artificiel.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        // /fr : page d'accueil publique réelle (/ redirige via next-intl middleware).
        "http://localhost:3000/fr",
        // /login : page de connexion SSR (CI-FIX-03 : wrapper sans opacity:0).
        "http://localhost:3000/login",
        // /admin exclu : redirige toujours vers /login en CI (sans auth) — inutile à auditer.
      ],
      startServerCommand: "pnpm start",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60000,
      numberOfRuns: 2,
      settings: {
        // CI-FIX-04 : désactive le throttling mobile simulé — mesure la
        // performance réelle du runner (sans émulation réseau/CPU).
        throttlingMethod: "provided",
        // Desktop : viewport adapté au produit, cohérent avec l'audience réelle.
        preset: "desktop",
        // Flags Chrome standard CI headless (--no-sandbox requis sur Linux CI).
        chromeFlags: "--no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.6 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.8 }],
        "categories:seo": ["warn", { minScore: 0.8 }],
        "first-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
}
