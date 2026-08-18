# Easy2Book V6 — Backlog Technique

> Généré le 2026-08-18 sur la branche `claude/easy2book-v6-modernization-7gyb5v`,
> à la suite d'un audit + stabilisation P0 du build.
>
> Légende priorité : **P0** = bloque la production · **P1** = critique ·
> **P2** = important · **P3** = amélioration.
>
> Légende statut données : tout module marqué **MOCK** affiche des données
> statiques/simulées, pas des données réelles issues de la DB ou d'un
> fournisseur. **NOT IMPLEMENTED** = fonctionnalité UI présente mais non
> câblée. **UNVERIFIED** = écrit/généré mais jamais exécuté contre une
> instance réelle (pas de `DATABASE_URL` dans cet environnement).

---

## Items résolus cette session

| ID | Priorité | Module | Problème | Solution | Commit |
|---|---|---|---|---|---|
| R-01 | P0 | Build | `pnpm typecheck` (36 erreurs), `pnpm lint` (75 erreurs) et `pnpm build` échouaient tous après le dernier refactor (Repository pattern + fusion d'enums) — masqué par `typescript.ignoreBuildErrors: true` | Chaque erreur corrigée à la racine contre le schéma réel (pas de suppression) ; `ignoreBuildErrors` repassé à `false` | `00b481a` |
| R-02 | P0 | DB / Migrations | 15 tables du module V6 (wallet_accounts, wallet_ledger, margin_rules, journal_entries/lines, reservation_financials/status_history/validations, validation_comments/history, suppliers, supplier_modules/logs, product_inventory, api_logs) existaient uniquement dans `schema.ts`, jamais dans une migration Drizzle trackée → `pnpm db:migrate` sur une DB vierge les aurait toutes omises | Migration trackée `drizzle/0009_v6_financials_suppliers_validations.sql` générée, avec conversion sûre (CASE) des valeurs `wallet_transactions.type` legacy UPPERCASE | `2b4bec1` |
| R-03 | P0 | Sécurité / RLS | Les 15 tables ci-dessus n'avaient aucune policy RLS (Drizzle n'en génère pas) | `drizzle/manual/0010_v6_financials_suppliers_validations_rls.sql` écrit, suivant le pattern `current_agency_id()`/`is_super_admin()` déjà établi | `2b4bec1` — **UNVERIFIED, jamais appliqué à une DB réelle** |
| R-04 | P1 | Build | Convention `middleware.ts` dépréciée sous Next 16 (warning de build) | Renommé en `proxy.ts` + export `proxy` (au lieu de `middleware`) | `8018c63` |
| R-05 | P1 | Sécurité | `PRO_ROUTES` défini mais jamais utilisé dans le middleware — vérifié : `app/pro/(app)/layout.tsx` fait déjà sa propre vérification de rôle, ce n'était pas un trou de sécurité actif | Variable morte supprimée | `8018c63` |

---

## P0 — Bloque la production

Aucun item P0 restant identifié à ce jour. Le build compile, type-check, lint et
86/86 tests unitaires passent.

---

## P1 — Critique

### P1-01 — RLS non appliquée

- **Module** : Base de données / Sécurité multi-tenant
- **Problème** : `drizzle/manual/0010_v6_financials_suppliers_validations_rls.sql`
  (et plus généralement tous les fichiers `drizzle/manual/*.sql`) ne sont **jamais
  exécutés automatiquement** — ni par `pnpm db:migrate`, ni par aucune CI. Ils
  doivent être appliqués à la main via `psql -f`.
- **Impact** : Sur un environnement fraîchement provisionné, les 15 tables V6
  seraient lisibles/écrivables sans isolation par agence tant que ce fichier
  n'a pas été appliqué — un `service_role` bypass Supabase existe mais un rôle
  `authenticated` mal configuré ne serait pas isolé.
- **Solution** : Appliquer `drizzle/manual/0001_rls_policies.sql` →
  `0010_v6_financials_suppliers_validations_rls.sql` dans l'ordre sur staging,
  puis vérifier avec `select * from pg_policies` que les policies existent
  pour les 15 tables. Envisager d'automatiser via un script `db:apply-rls`
  dans `package.json` plutôt que de compter sur une procédure manuelle.
- **Fichiers** : `drizzle/manual/*.sql`
- **Complexité estimée** : Faible (exécution) / Moyenne (automatisation)
- **Statut** : NOT DONE — **nécessite un accès `DATABASE_DIRECT_URL`, absent de cette session**
- **Tests** : Aucun test RLS automatisé n'existe dans le repo (`tests/`, `lib/**/__tests__`) — à créer (ex. via `pgTAP` ou des requêtes Supabase avec un JWT de test par agence).

### P1-02 — Booking Engine : 6 modules sur 7 sont des maquettes

- **Module** : Booking Engine (page d'accueil)
- **Problème** : Dans `components/booking-engine.tsx`, seul l'onglet **Hôtels
  Tunisie** construit une vraie requête et redirige vers `/hotels/search`.
  Les 6 autres (Vols, Hôtels Monde, Omraty, Voyages Organisés, Transferts,
  Car) ont des formulaires visuels complets mais leur `onSubmit` ne fait
  qu'un `router.push()` vers une page de destination sans transmettre les
  critères saisis (aucun state, aucun query param construit à partir des
  champs). C'est documenté dans le propre `README.md` du repo.
- **Impact** : Sur la page d'accueil, remplir le formulaire Vols/Omra/Voyages/
  Transferts/Car et cliquer « RECHERCHER » emmène l'utilisateur vers la page
  du module sans ses critères de recherche — expérience cassée du point de
  vue produit.
- **Solution** : Pour chaque module, construire les query params (comme le
  fait déjà `HotelsTunisieSearch`) et les transmettre à la page de
  destination, qui doit elle-même lire ces params pour pré-remplir sa
  recherche.
- **Fichiers** : `components/booking-engine.tsx` (fonctions `VolsForm`,
  `HotelsMondeForm`, `OmratyForm`, `VoyagesOrganisesForm`, `TransfertsForm`,
  `CarForm`)
- **Complexité estimée** : Moyenne (6 formulaires × mapping vers chaque page
  de résultats, dont certaines pages de résultats elles-mêmes doivent être
  vérifiées / complétées)
- **Statut** : NOT IMPLEMENTED
- **Tests** : Aucun test E2E n'existe pour ce parcours ; `playwright.config.ts`
  est présent mais son exécution n'a pas été vérifiée cette session.

### P1-03 — Suite E2E jamais exécutée cette session

- **Module** : Tests
- **Problème** : `playwright.config.ts` et un dossier `e2e/` existent, mais
  `pnpm test:e2e` n'a pas été lancé dans cette session (pas de navigateur/DB
  de test configurés dans cet environnement).
- **Impact** : Impossible de confirmer que les parcours B2C/B2B/Omra
  fonctionnent de bout en bout — seuls les tests unitaires (86/86) et le
  build ont été vérifiés.
- **Solution** : Exécuter `pnpm test:e2e` dans un environnement avec
  `DATABASE_URL` + Supabase de test, corriger ce qui casse.
- **Fichiers** : `e2e/`, `playwright.config.ts`
- **Complexité estimée** : Inconnue tant que non exécuté
- **Statut** : UNVERIFIED

---

## P2 — Important

### P2-01 — Formulaires Omra/Transfert sur données codées en dur

- **Module** : Omra, Transferts
- **Problème** : `components/omra/omra-booking-form.tsx` utilise
  `MOCK_PACKAGES`/`MOCK_ALLOTMENTS` codés en dur au lieu de charger depuis
  les tables `omra_packages`/`omra_allotments` (qui existent et sont
  trackées, cf. `drizzle/0006_omra_module.sql`). `components/transfer/
  transfer-booking-form.tsx` utilise `MOCK_ZONES`/`VEHICLE_TYPES` codés en
  dur au lieu de `catalog_transfer_zones`/`catalog_transfer_pricing`.
- **Impact** : Un client peut sélectionner un package Omra ou une zone de
  transfert qui n'existe pas réellement en base ; le prix affiché ne
  correspond à aucune donnée réelle. Contraire à la règle §53 du brief
  (« Prix, hôtels, offres… ne doivent pas être hardcodés dans React »).
- **Solution** : Remplacer les tableaux `MOCK_*` par des chargements Server
  Component / Server Action depuis les tables Drizzle correspondantes.
- **Fichiers** : `components/omra/omra-booking-form.tsx`,
  `components/transfer/transfer-booking-form.tsx`
- **Complexité estimée** : Moyenne
- **Statut** : MOCK
- **Tests** : Aucun test ne couvre actuellement le chargement de ces données.

### P2-02 — Pages admin avec données simulées

- **Module** : Admin (logs, accounting, products), Mutuelle
- **Problème** : `app/admin/logs/page.tsx`, `app/admin/accounting/page.tsx`,
  `app/admin/products/page.tsx`, `app/mutuelle/page.tsx` contiennent des
  données simulées (`// Simulation`, `mockResponse`) plutôt que des requêtes
  DB réelles.
- **Impact** : Ces écrans admin affichent des chiffres qui ne reflètent pas
  l'état réel de la plateforme.
- **Solution** : Auditer chaque page individuellement, remplacer par des
  requêtes Drizzle réelles ou marquer explicitement "Bientôt disponible" si
  la fonctionnalité n'est pas encore prête (au lieu d'afficher des données
  qui semblent réelles).
- **Fichiers** : voir liste ci-dessus
- **Complexité estimée** : Moyenne à élevée selon la page
- **Statut** : MOCK

### P2-03 — Drift de formatage Prettier

- **Module** : Qualité de code
- **Problème** : `pnpm format:check` signale 172 fichiers en écart de
  formatage (`pnpm format` non exécuté récemment).
- **Impact** : Aucun impact fonctionnel — cosmétique uniquement — mais génère
  des diffs de PR bruyants et rend les futures revues plus difficiles.
- **Solution** : `pnpm format` (write) dans un commit dédié séparé des
  changements de logique, pour garder les diffs lisibles.
- **Fichiers** : ~172 fichiers, voir sortie de `pnpm format:check`
- **Complexité estimée** : Triviale (mécanique) mais gros diff
- **Statut** : NOT DONE — pas exécuté cette session pour ne pas noyer les
  commits de correction de bugs sous un diff de formatage massif.

### P2-04 — CSP autorise `unsafe-inline`/`unsafe-eval`

- **Module** : Sécurité — Headers HTTP
- **Problème** : `next.config.mjs` : `script-src 'self' 'unsafe-inline'
  'unsafe-eval' https://va.vercel-scripts.com`. Nécessaire en dev, mais
  affaiblit la CSP en production (déjà noté dans `AUDIT_REPORT.md`).
- **Impact** : Réduit la protection XSS de la CSP.
- **Solution** : Migrer vers un CSP à base de nonce par requête (Next.js
  supporte `headers()` dynamiques + nonce injecté dans `<Script>`), retirer
  `unsafe-inline`/`unsafe-eval` en production.
- **Fichiers** : `next.config.mjs`
- **Complexité estimée** : Moyenne
- **Statut** : NOT DONE

---

## P3 — Amélioration

### P3-01 — 124 avertissements ESLint restants

- **Module** : Qualité de code
- **Problème** : `pnpm lint` : 0 erreur mais 124 warnings, essentiellement
  `@typescript-eslint/no-unused-vars` (imports/variables inutilisés dans
  `lib/omra/booking-actions.ts`, `lib/yield/actions.ts`,
  `lib/repositories/*.ts`, etc.).
- **Impact** : Aucun impact fonctionnel ; nettoyage de dette technique.
- **Solution** : Passe de nettoyage dédiée, fichier par fichier.
- **Complexité estimée** : Faible, juste volumineux
- **Statut** : NOT DONE

### P3-02 — Documentation obsolète

- **Module** : Documentation
- **Problème** : `ARBORESCENCE.md`, `AUDIT_REPORT.md`,
  `docs/security-audit-report.md` référencent encore `middleware.ts` (renommé
  en `proxy.ts` dans cette session) et décrivent un état du repo antérieur
  aux modules V6.
- **Impact** : Documentation trompeuse pour les futurs contributeurs.
- **Solution** : Mettre à jour ou archiver ces documents datés sous `docs/archive/`.
- **Complexité estimée** : Faible
- **Statut** : NOT DONE

---

## Ce qui n'a PAS été audité cette session (à traiter explicitement)

Pour rester honnête sur le périmètre réellement couvert (règle §59 du brief —
ne jamais prétendre avoir vérifié ce qui ne l'a pas été) :

- **Design System / composants `E2B*`** : NOT IMPLEMENTED — aucun composant
  de ce nom n'existe dans le repo (`components/ui/` reste du shadcn/ui brut).
- **B2B Dashboard complet, Pricing Engine centralisé, CRM, Lead Scoring,
  Loyalty, AI Assistant** : NOT IMPLEMENTED en tant que modules dédiés. Des
  briques existent (pricing_margins, marginRules, wallet), mais pas
  d'orchestration transverse telle que décrite dans le brief.
- **Supplier Hub / Adapter Layer avec retry/circuit breaker/cache** : NOT
  IMPLEMENTED — le module `suppliers` gère la configuration des connexions,
  pas une couche d'abstraction runtime avec résilience.
- **i18n AR/RTL** : présent (`lib/i18n.ts`, FR/AR/EN), non re-testé cette
  session.
- **SEO (sitemap, structured data par page destination)** : non audité cette
  session.
- **CI/CD** : aucun fichier `.github/workflows/` inspecté cette session —
  état inconnu (UNVERIFIED).
- **Déploiement Vercel réel (env vars, cron, fonctions)** : non vérifiable
  depuis cet environnement (pas d'accès Vercel).
- **Audit de sécurité complet** (IDOR, SSRF, upload, rate limiting bout en
  bout) : non fait cette session au-delà de la RLS des nouvelles tables et de
  la CSP.

---

## Prochaines étapes recommandées (par ordre)

1. Appliquer `drizzle/manual/0001_rls_policies.sql` → `0010_*.sql` sur
   staging et vérifier (P1-01).
2. Lancer `pnpm test:e2e` et corriger ce qui casse (P1-03).
3. Câbler les 6 formulaires du Booking Engine vers leurs pages de résultats
   (P1-02).
4. Remplacer les données `MOCK_*` d'Omra/Transferts par des requêtes DB
   réelles (P2-01).
5. `pnpm format` dans un commit dédié (P2-03).
