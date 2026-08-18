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
| R-06 | P1 | Transferts — Pricing | `calculateTransferPrice()` était un **stub** : prix fixe par type de véhicule, ignorant complètement l'itinéraire et `catalog_transfer_pricing`. Utilisée aussi bien par la prévisualisation client que par `createTransferBooking` — les clients étaient débités sur un prix fictif, pas le tarif réel de l'agence | Requête réelle sur `catalog_transfer_pricing` (par zones × véhicule) + majoration nuit réelle par ligne de tarif + marge réelle via `pricingMargins`/`applyMargin` (module `transfer`). Retourne `null` si aucun tarif configuré au lieu d'inventer un prix ; les deux appelants gèrent ce cas | (ce commit) |
| R-07 | P1 | Booking Engine — Omra | `/omra` ignorait `searchParams` malgré un formulaire de recherche déjà fonctionnel ; le formulaire d'accueil (`OmratyForm`) utilisait des valeurs (`economique`/`confort`/`prestige`, "Distance Haram") sans rapport avec l'enum réel `omra_package_type` ni aucune colonne existante | `OmraSearch` et `OmratyForm` alignés sur l'enum réel (`omra`/`hajj`/`ramadan`/`umrah_plus`) ; "Distance Haram" retiré (aucune donnée pour le justifier — `omra_packages` n'a pas de référence hôtel à l'étape recherche) ; `app/omra/page.tsx` filtre désormais réellement sur `type` et sur `omra_allotments` (mois de départ, places disponibles) | (ce commit) |
| R-08 | P1 | Booking Engine — Voyages Organisés | Même bug : `/packages` ignorait `searchParams` | `app/packages/page.tsx` filtre désormais sur `title` (ILIKE — `catalog_packages` n'a pas de colonne destination dédiée), sur `durationDays`, et sur `catalog_package_departures` (mois, places disponibles) ; formulaire d'accueil aligné sur le même vocabulaire que `PackageSearch` | (ce commit) |
| R-09 | P1 | Booking Engine — Transferts | `TransferSearch` redirigeait déjà vers `/transferts/resultats?...`, une route qui n'existait pas (404) ; `TransferBookingForm` était câblé sur `MOCK_ZONES` et un `agencyId` codé en dur, uniquement atteignable depuis la sandbox | `app/transferts/resultats/page.tsx` créé (résout les zones réelles, appelle le tarif réel corrigé en R-06, affiche un vrai devis ou une erreur explicite si aucun tarif n'est configuré) ; `TransferBookingForm` accepte désormais `zones`/`agencyId`/`prefill` en props au lieu de données mockées ; `lib/agencies/default-agency.ts` ajouté pour résoudre l'agence OTA directe sans inventer d'ID ; formulaire d'accueil (`TransfertsForm`) câblé sur les vraies zones (chargées dans `app/page.tsx`) | (ce commit) |

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

### P1-02 — Booking Engine : Vols, Hôtels Monde, Car restent non câblés

- **Module** : Booking Engine (page d'accueil) + pages de résultats par module
- **État actuel** (après R-06 à R-09) : **Hôtels Tunisie, Omraty, Voyages
  Organisés, Transferts fonctionnent de bout en bout** avec des données
  réelles (recherche → filtrage DB réel → devis réel → réservation réelle
  pour Transferts ; recherche → filtrage DB réel pour Omra/Voyages, qui
  n'avaient pas de tunnel de réservation dédié à corriger). Restent :
  - **Vols** : `VolsForm` capture correctement `origin`/`destination` (bug
    corrigé, cf. commit précédent) et route vers `/vols?...`, mais
    `app/vols/page.tsx` ne lit aucun `searchParams` et `lib/vols/client.ts`
    est un stub explicite nécessitant `FLIGHTS_API_KEY`/
    `FLIGHTS_API_BASE_URL` (Amadeus/Sabre). **Bloqué sur des identifiants
    fournisseur absents** — à demander, jamais à contourner par des
    disponibilités/prix inventés (règle §52/59 du brief).
  - **Car** : `CarForm` ne transmet toujours rien et `/car` ne lit aucun
    `searchParams`. **Aucune table `cars`/`car_rentals` n'existe dans le
    schéma** — c'est un nouveau module à concevoir (schéma + fournisseur ou
    inventaire propre), pas une correction de câblage.
  - **Hôtels Monde** : `HotelsMondeForm`/`app/hotels-monde/page.tsx` ne
    transmettent/lisent toujours rien. Contrairement à Vols/Car, une source
    de données plausible existe déjà (`lib/hotel-search`, actuellement
    scopé Tunisie) mais il n'est pas clair si ce module doit la réutiliser
    ou passer par un fournisseur international séparé — décision produit
    nécessaire avant de câbler.
- **Fichiers** : `components/booking-engine.tsx` (`VolsForm`, `CarForm`,
  `HotelsMondeForm`), `app/vols/page.tsx`, `app/car/page.tsx`,
  `app/hotels-monde/page.tsx`, `lib/vols/client.ts`
- **Complexité estimée** : bloquée pour Vols (accès API requis) ; élevée
  pour Car (nouveau module de A à Z) ; moyenne pour Hôtels Monde une fois la
  source de données confirmée
- **Statut** : NOT IMPLEMENTED (Vols bloqué sur identifiants ; Car et Hôtels
  Monde nécessitent une décision produit avant tout câblage)
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

### P2-01 — OmraBookingForm reste orphelin (sandbox uniquement)

- **Module** : Omra
- **Historique** : en creusant pour P1-02, vérifié que ni `OmraBookingForm`
  ni `TransferBookingForm` n'étaient importés en dehors de
  `app/pro/sandbox/page.tsx` (page explicitement documentée "données
  simulées... non accessible en production") — ce n'était donc pas un cas de
  données fictives présentées comme réelles en production.
- **Résolu pour Transferts** (R-09) : `TransferBookingForm` est maintenant
  raccroché à une vraie page (`/transferts/resultats`) avec de vraies zones
  et un vrai tarif.
- **Reste ouvert pour Omra** : `OmraBookingForm` (`components/omra/
  omra-booking-form.tsx`, `MOCK_PACKAGES`/`MOCK_ALLOTMENTS`) a toute la
  logique de soumission (`createOmraBooking`, qui valide bien le
  package/l'allotement côté serveur contre la vraie DB) mais n'est
  raccroché à aucune page réelle — il manque un `/omra/[id]` qui chargerait
  le package réel et ses allotements réels (le lien `/omra/[id]` existe déjà
  dans `OmraPackageList`, cf. `components/omra/omra-package-list.tsx`, mais
  la route elle-même n'existe pas).
- **Fichiers** : `components/omra/omra-booking-form.tsx`,
  `components/omra/omra-package-list.tsx` (lien déjà présent),
  `app/omra/[id]/page.tsx` (à créer)
- **Complexité estimée** : Moyenne — même famille de travail que R-09 pour
  Transferts (charger les données réelles, passer en props, retirer les
  `MOCK_*`)
- **Statut** : NOT IMPLEMENTED
- **Statut** : reclassé — pas un problème de données mockées en prod ; le
  vrai gap est le câblage manquant, couvert par P1-02.

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
2. Lancer `pnpm test:e2e` et corriger ce qui casse, en particulier les
   nouveaux parcours Omra/Voyages/Transferts (P1-03).
3. Décider de la source de données Vols (demander les clés API) et Hôtels
   Monde (Tunisie élargie ou fournisseur séparé) ; concevoir le schéma Car
   (P1-02).
4. Créer `/omra/[id]` pour raccrocher `OmraBookingForm` à de vraies données
   (P2-01).
5. `pnpm format` dans un commit dédié (P2-03).
