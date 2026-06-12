/**
 * Stratégie de cache hiérarchique — Easy2Book SRE
 *
 * Définit les TTL et stratégies pour chaque type de données :
 *
 * ┌─────────────────────┬─────────┬─────────────┬────────────────────────────┐
 * │ Donnée              │ TTL     │ Stratégie   │ Clé Redis                  │
 * ├─────────────────────┼─────────┼─────────────┼────────────────────────────┤
 * │ Villes MyGo         │ 24h     │ SWR         │ mygo:cities                │
 * │ Hôtels par ville    │ 24h     │ SWR         │ mygo:hotels:<cityId>       │
 * │ Détail hôtel        │ 24h     │ SWR         │ mygo:hotel:<hotelId>       │
 * │ Régimes / Devises   │ 24h     │ SWR         │ mygo:boardings / currencies│
 * │ Yield rules agence  │ 5 min   │ memoize     │ e2b:yield:<agencyId>       │
 * │ Recherche hôtels    │ 5 min   │ memoize     │ mygo:search:<hash>         │
 * │ Disponibilités dyn. │ 60s     │ memoize     │ mygo:avail:<hash>          │
 * │ Feature flags       │ 30s     │ memoize     │ e2b:ff:<flag>              │
 * │ Stale search (dégr.)│ 24h     │ write-aside │ e2b:stale:mygo:search:<h>  │
 * └─────────────────────┴─────────┴─────────────┴────────────────────────────┘
 *
 * Ce fichier documente et exporte les constantes de TTL utilisées dans tout le projet.
 * Il ne contient PAS de logique de cache (voir lib/cache/redis.ts).
 */

export const CACHE_TTL = {
  // ── Données FROIDES (statiques, changent rarement) ──────────────────────
  MYGO_STATIC: 86_400,        // 24h — villes, hôtels catalogue, régimes
  HOTEL_DETAIL: 86_400,       // 24h — descriptions, photos
  STALE_FALLBACK: 86_400,     // 24h — cache de dégradation gracieuse

  // ── Données TIÈDES (changent quotidiennement) ────────────────────────────
  YIELD_RULES: 300,           // 5 min — marges agence
  HOTEL_SEARCH: 300,          // 5 min — résultats de recherche
  FEATURE_FLAGS: 30,          // 30s  — feature flags

  // ── Données CHAUDES (temps réel, changent à chaque requête) ─────────────
  AVAILABILITY: 60,           // 60s  — disponibilités dynamiques

  // ── Idempotence ───────────────────────────────────────────────────────────
  IDEMPOTENCY_DEBIT: 86_400,  // 24h  — clés d'idempotence débit wallet
} as const

export const SWR_STALE_AFTER = {
  MYGO_STATIC: 43_200,   // fraîche 12h, revalidation si entre 12h et 24h
  HOTEL_DETAIL: 43_200,
} as const

/**
 * Recommandations cold start :
 *
 * 1. WARM-UP au démarrage (cron /api/cron/warm-cache) :
 *    → Précharge villes + hôtels 8 destinations phares
 *    → TTL 24h avec SWR (zéro latence ajoutée au runtime)
 *
 * 2. EDGE CACHING (Vercel CDN) :
 *    → Cache-Control: public, max-age=300, stale-while-revalidate=60
 *    → Les recherches identiques sont servies depuis le CDN edge
 *
 * 3. DEDUPLICATION des requêtes MyGo :
 *    → La clé memoize est un hash stable des paramètres de recherche
 *    → Deux agents cherchant la même ville/date partagent le même cache
 *
 * 4. PREFETCH des données statiques au build time (Next.js generateStaticParams) :
 *    → /hotels/[citySlug] — pages statiques générées pour les 8 villes phares
 */
export const CACHE_ADVICE = {
  coldStart: "Utiliser /api/cron/warm-cache via Vercel Cron à 04:00 UTC",
  edgeCache: "Cache-Control: public, max-age=300, stale-while-revalidate=60",
  deduplication: "Clé hash stable sur les paramètres de recherche (voir lib/mygo/client.ts stableHash)",
  prefetch: "generateStaticParams pour les 8 destinations phares",
} as const
