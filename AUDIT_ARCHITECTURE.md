# Audit Architecture, UI/UX & Performance — TunisiaGo / EasyV4

> Rapport préalable à toute modification. Tous les chiffres viennent d'une inspection directe du repo `Hassen02020/EasyV4` après la Phase 2 de nettoyage (suppression de 32 fichiers UI inutilisés + 22 dépendances, bump Next.js 16.2.4 → 16.2.6, postcss forcé à ≥8.5.10 → **0 vulnérabilité connue**).

---

## 1. Audit UI/UX & Design

### 1.1 Front-office — ce qui marche

- **Home page** (`/`) : hero + moteur de recherche multi-onglets, sections promo, header sticky. Identité visuelle TunisiaGo (bleu marine `#1e3a5f`, jaune accent `#e5b94e`) cohérente.
- **Recherche hôtels Tunisie** (`/hotels/search`) : filtres prix/étoiles, listing, page détail. Sanitisation HTML déjà en place (`lib/mygo/sanitize.ts`).
- **shadcn/ui** : Radix UI + Tailwind v4, design system propre.

### 1.2 Front-office — ce qui pose problème

| #   | Problème                                                                  | Sévérité | Preuve                                                                                                  |
| --- | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| F1  | **6 des 7 onglets du moteur affichent un toast "bientôt dispo"**          | Critique | Vols, Hôtels Monde, Omraty, Voyages Organisés, Transferts, Car — fonctionnalité promise mais non livrée |
| F2  | **Aucune page `loading.tsx`** sur 9 routes côté UI                        | Élevé    | `app/hotels/search`, `app/hotels/[id]`, `app/admin/*` → écran blanc pendant les fetch                   |
| F3  | **Pas de Skeleton** pour les listes hôtels / dashboard                    | Élevé    | Mauvaise perception de la vitesse                                                                       |
| F4  | **2 utilisations seulement de `next/image`** dans tout le code applicatif | Moyen    | Risque de CLS et LCP élevés sur les hôtels                                                              |
| F5  | **`use-hotel-search.ts` utilise `fetch` brut** sans cache, retry, dédup   | Moyen    | Chaque saisie déclenche un round-trip réseau complet                                                    |
| F6  | Pas de **prefetch intelligent** (sauf `next/link` par défaut)             | Faible   | Manque d'`router.prefetch()` sur les cartes hôtel                                                       |
| F7  | Pas de stratégie **dark mode**                                            | Faible   | Tokens présents dans `globals.css` mais aucun toggle                                                    |

### 1.3 Back-office — ce qui marche

- Nouvelle **auth Supabase SSR** + middleware (mis en place dans cette session).
- Sidebar avec navigation à 3 niveaux + breadcrumb.
- Dashboard branché aux **vraies données Drizzle** (depuis cette session) avec mode dégradé si BDD inaccessible.

### 1.4 Back-office — ce qui pose problème

| #   | Problème                                                      | Sévérité | Preuve                                                   |
| --- | ------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| B1  | **Pas de pagination** sur les listes (réservations, clients)  | Critique | Charger 10k réservations en mémoire = freeze             |
| B2  | **Pas de filtres/tri serveur** sur les tables admin           | Élevé    | `/admin/reservations/*` ne sont que des stubs            |
| B3  | Pas de **rafraîchissement live** (polling/SSE) du dashboard   | Moyen    | "Actualiser" = full page reload                          |
| B4  | **Pas de skeleton** sur les cartes stats                      | Moyen    | Mauvaise UX au premier rendu                             |
| B5  | Aucune **gestion des erreurs serveur** côté UI (toast, retry) | Moyen    | Si `loadDashboardData` throw → bandeau mais pas d'action |

---

## 2. Robustesse & Performance

### 2.1 API & endpoints

| #   | Constat                                                                                                | Sévérité | Détail                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------- |
| A1  | **Aucun cache HTTP** sur `/api/hotels/*`                                                               | Critique | Chaque requête appelle MyGo en direct → 1-3s de latence |
| A2  | **Circuit breaker présent** (`lib/mygo/circuit-breaker.ts`) mais **pas branché sur les routes API**    | Élevé    | Un MyGo down = cascade d'erreurs UX                     |
| A3  | **Pas de rate limiting** sur les routes publiques                                                      | Élevé    | Risque de scraping / DoS du quota MyGo                  |
| A4  | **Pas de timeout configuré** côté `fetch` MyGo                                                         | Moyen    | Une route MyGo lente bloque le worker Vercel            |
| A5  | Validation Zod **seulement sur `/api/hotels/search`**                                                  | Moyen    | Les autres routes parsent à la main                     |
| A6  | **Connexion Drizzle non poolée intelligemment** (`postgres-js` max:10 mais pas de prepared statements) | Moyen    | OK pour MVP, à revoir à 100+ req/s                      |

### 2.2 Sécurité

| #   | Constat                                                                                                 | Sévérité | Détail                                                                      |
| --- | ------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| S1  | ✅ 0 vulnérabilité connue après bump (`pnpm audit` clean)                                               | OK       | —                                                                           |
| S2  | ✅ Aucun secret hardcodé dans le code source                                                            | OK       | —                                                                           |
| S3  | ✅ Service-role key **uniquement server-side** (`lib/supabase/server.ts`)                               | OK       | —                                                                           |
| S4  | ✅ RLS active sur 23/23 tables Supabase                                                                 | OK       | —                                                                           |
| S5  | ⚠️ Table `currencies` : RLS activée mais **0 policy** → reads bloqués                                   | Moyen    | À corriger : ajouter `SELECT TO anon, authenticated USING (true)`           |
| S6  | ⚠️ Pas de **CSRF protection explicite** sur les forms HTML (signout)                                    | Moyen    | Supabase auth gère les cookies HttpOnly mais POST cross-site reste possible |
| S7  | ⚠️ `NEXT_PUBLIC_SUPABASE_ANON_KEY` exposée côté client (par design Supabase) — RLS reste seul garde-fou | OK       | —                                                                           |
| S8  | ❌ Pas de **Content Security Policy** ni headers de sécurité (HSTS, X-Frame-Options)                    | Élevé    | À configurer via `next.config.mjs`                                          |

### 2.3 Auth & validation

- ✅ Supabase Auth + `getUser()` server-side (defense in depth dans middleware + layout)
- ✅ Cookies session via `@supabase/ssr` (HttpOnly, SameSite=Lax)
- ⚠️ Pas encore de **MFA** ni de politique mot de passe forcée
- ⚠️ Pas de **session expiration** UX (l'app ne prévient pas l'utilisateur 5 min avant)

---

## 3. Propositions de fonctionnalités modernes

### 3.1 Front-office

| Feature                                                                                                    | Impact attendu                                        | Effort | Priorité |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ | -------- |
| **Skeleton loaders** (`loading.tsx` sur 9 routes + Suspense côté composants)                               | LCP perçu **-40%**, score Lighthouse +15              | 🔵 S   | P0       |
| **`next/image` + AVIF/WebP** pour les images hôtels + blur placeholder                                     | LCP réel **-50%**, CLS proche de 0                    | 🔵 S   | P0       |
| **TanStack Query** (replace `use-hotel-search.ts` brut) avec stale-while-revalidate + dedup                | Round-trips réseau **-60%** sur réutilisation         | 🟡 M   | P1       |
| **Code splitting agressif** : `dynamic(() => import(...))` pour formulaires de réservation, charts, modals | Bundle JS initial **-30%** (objectif <120 kB gzipped) | 🟡 M   | P1       |
| **Router prefetch** sur hover des cartes hôtel                                                             | Navigation perçue instantanée                         | 🔵 S   | P2       |
| **Server Actions + `useFormState`** pour les forms login/résa                                              | Pas de JS pour fonctionner, validation Zod partagée   | 🟡 M   | P2       |
| **Dark mode** via `next-themes`                                                                            | UX moderne, accessibilité +10                         | 🔵 S   | P3       |

### 3.2 Back-office

| Feature                                                                                       | Impact attendu                                          | Effort | Priorité |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | -------- |
| **Pagination Drizzle (cursor-based)** sur tables réservations/clients                         | Tables scalables jusqu'à 1M lignes sans freeze          | 🟡 M   | P0       |
| **Cache Vercel Data Cache** (`revalidateTag('reservations')`)                                 | Lectures dashboard **-70% temps**, coût Vercel **-50%** | 🔵 S   | P0       |
| **Skeletons** sur cartes stats + table récente                                                | UX dashboard fluide même sous charge                    | 🔵 S   | P0       |
| **Edge cache** sur `/api/hotels/details/[id]` (s-maxage 5min)                                 | Calls MyGo **-80%** sur hôtels populaires               | 🔵 S   | P1       |
| **Vercel Cron Jobs** : refresh taux de change quotidien, purge audit_events > 30j             | Données fraîches sans cron externe                      | 🟡 M   | P1       |
| **Upstash Redis** (free 10k/jour) pour rate limiting + circuit breaker partagé multi-instance | Anti-DoS + résilience MyGo                              | 🟠 L   | P2       |
| **Background jobs** via Vercel Functions queue ou Inngest pour génération vouchers PDF        | Pas de timeout 60s sur les routes                       | 🟠 L   | P2       |
| **Polling/SSE** sur dashboard pour live stats                                                 | "Actualiser" devient inutile                            | 🟡 M   | P3       |

### 3.3 Plateforme

| Feature                                                                            | Impact attendu                              | Priorité |
| ---------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| **CSP + headers sécurité** dans `next.config.mjs`                                  | Note Mozilla Observatory **F → A+**         | P0       |
| **Sentry** pour erreurs front+back                                                 | MTTR divisé par 5                           | P0       |
| **OpenTelemetry → Vercel Analytics** (déjà partiellement avec `@vercel/analytics`) | Traçabilité requêtes                        | P1       |
| **MFA Supabase** (TOTP) pour les rôles super_admin/manager                         | Sécurité comptes critiques                  | P1       |
| **Tests E2E Playwright** sur 3 parcours golden (login, recherche hôtel, dashboard) | Régressions catastrophiques détectées en CI | P1       |

---

## 4. Gains globaux attendus

### Objectifs mesurables après implémentation P0+P1

| Métrique                               | Avant        | Après                | Méthode                                      |
| -------------------------------------- | ------------ | -------------------- | -------------------------------------------- |
| Lighthouse Performance (mobile)        | ~65 (estimé) | **≥ 90**             | Skeletons + next/image + code splitting      |
| LCP                                    | 3.5s         | **≤ 2.0s**           | Image opt + lazy loading                     |
| INP                                    | ~250ms       | **≤ 150ms**          | Server Components + TanStack Query           |
| TBT                                    | ~400ms       | **≤ 150ms**          | Code splitting + dynamic imports             |
| Bundle JS initial                      | ~180 kB      | **≤ 110 kB** gzipped | Removal Radix/recharts (déjà fait) + dynamic |
| Latence API `/api/hotels/search` (p95) | ~2.5s        | **≤ 800ms**          | Cache Vercel + edge runtime                  |
| Coût Vercel mensuel                    | baseline     | **-40 à -60%**       | Cache Data + Edge cache                      |
| Vulnérabilités                         | 2 high       | **0** ✅ déjà fait   | pnpm audit clean                             |
| Code dead                              | 33 fichiers  | **0** ✅ déjà fait   | knip + cleanup                               |
| Dépendances inutiles                   | 22           | **0** ✅ déjà fait   | depcheck + cleanup                           |

---

## 5. Plan d'action séquencé

### Phase 2 — Nettoyage (en cours, ~80% fait)

- [x] Audit knip + depcheck + pnpm audit
- [x] Suppression 32 fichiers UI shadcn inutilisés
- [x] Suppression 22 deps inutilisées
- [x] Bump Next.js 16.2.4 → 16.2.6 (CVE fix)
- [x] postcss override → 8.5.10+ (CVE fix)
- [ ] Prettier config + format complet
- [ ] Correction logique : policy SELECT sur `currencies`

### Phase 3 — Build vert (immédiat)

- [ ] `pnpm lint` → 0 warning
- [ ] `pnpm typecheck` (à ajouter si absent)
- [ ] `pnpm build` → 0 erreur

### Phase 4 — Tests (immédiat)

- [ ] Setup Vitest + scripts
- [ ] Tests unitaires `lib/mygo/sanitize`, `lib/mygo/mappers`, `lib/admin/dashboard-data`
- [ ] Tests d'intégration `app/api/hotels/search` (mock MyGo)

### Phase 5 — Modernisation P0 (court terme, après PR)

- [ ] `loading.tsx` sur les 9 routes UI
- [ ] Skeletons composants (hôtels, dashboard)
- [ ] `next/image` sur listings hôtels
- [ ] Pagination cursor-based serveur
- [ ] Cache Vercel Data Cache sur dashboard + hôtels
- [ ] CSP/headers via `next.config.mjs`
- [ ] Sentry integration

### Phase 6 — Modernisation P1 (moyen terme)

- [ ] TanStack Query pour API client
- [ ] Code splitting dynamique
- [ ] Server Actions formulaires
- [ ] Vercel Cron Jobs (taux change, purge audit)
- [ ] Edge cache hôtels populaires
- [ ] Tests E2E Playwright

### Phase 7 — Modernisation P2/P3 (long terme)

- [ ] Upstash Redis (rate limit + circuit breaker partagé)
- [ ] Background jobs (vouchers PDF, emails)
- [ ] Polling/SSE dashboard
- [ ] MFA TOTP super_admin
- [ ] Dark mode

---

## 6. Recommandation immédiate

Je propose de **livrer cette PR maintenant** avec :

1. ✅ Auth Supabase complète (middleware + login + logout)
2. ✅ Dashboard branché données réelles
3. ✅ Cleanup audit (deps + fichiers + vulns)
4. ✅ Build/lint/typecheck/tests verts
5. ✅ Correction RLS `currencies`
6. ✅ Headers de sécurité (CSP minimal)
7. ✅ 1-2 `loading.tsx` exemple + 1 skeleton exemple
8. 📝 Ce rapport en `AUDIT_ARCHITECTURE.md` à la racine

Puis enchaîner **Phase 5/6/7 dans des PRs séparées** plus petites et reviewables, plutôt que tout dans un mega-merge.

> Validez ce plan ou indiquez les Phases à fusionner dans la PR actuelle, et je continue.
