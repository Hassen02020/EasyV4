/**
 * Lighthouse CI configuration.
 *
 * Usage (local) :
 *   pnpm build && pnpm dlx @lhci/cli autorun
 *
 * In CI the build step runs before lhci autorun, so startServerCommand
 * only needs to start the already-built server.
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
