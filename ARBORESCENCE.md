# ARBORESCENCE COMPLÈTE — EasyV4 (Easy2Book OTA + Portail B2B)

> Inventaire exhaustif du dépôt `Hassen02020/EasyV4` au commit courant de la branche `devin/1778834500-b2b-portal` (PR #8).
>
> **Type de projet** : Application Next.js 15 (App Router, React 19, TypeScript strict) — site web OTA Tunisie + portail B2B partenaires, branché Supabase Postgres + RLS, intégration MyGo Hotels.
>
> **Méthode** : chemins relatifs au repo root `/home/ubuntu/repos/EasyV4`. Les routes web sont déduites de la convention App Router de Next.js (`app/<segment>/page.tsx` → `/<segment>`, `app/<segment>/route.ts` → endpoint API, `(group)` est un segment de groupage qui n'apparaît pas dans l'URL).

---

## 1. Arborescence physique des dossiers

```
EasyV4/
├── .env.example
├── .env.local                    (ignoré par git — secrets locaux)
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── AUDIT_ARCHITECTURE.md         (audit Senior+Sécurité initial)
├── ARBORESCENCE.md               (CE document)
├── README.md
├── TEST_PLAN_PR7.md              (plan QA back-office)
├── TEST_PLAN_PR9.md              (plan QA portail B2B + marges)
├── TEST_REPORT_PR9.md            (rapport exécution test PR #9)
├── components.json               (config shadcn/ui)
├── drizzle.config.ts             (config Drizzle ORM)
├── eslint.config.mjs             (ESLint flat config)
├── next-env.d.ts                 (types Next auto-générés)
├── next.config.mjs               (config Next + CSP/HSTS/headers sécu)
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs            (Tailwind v4 PostCSS plugin)
├── proxy.ts                      (middleware Supabase — refresh session + redirect /admin /pro)
├── test-report-pr6.md
├── test-report-pr7.md
├── tsconfig.json
├── tsconfig.tsbuildinfo
│
├── app/                          (Next App Router — pages + API)
│   ├── globals.css               (palette OKLCH + tokens Tailwind v4)
│   ├── layout.tsx                (root layout : ThemeProvider, fonts, Toaster)
│   ├── page.tsx                  (homepage publique /)
│   ├── login/                    (login super-admin /admin)
│   ├── admin/                    (Back-office Easy2Book)
│   │   └── reservations/
│   │       ├── hotels/
│   │       ├── omra/
│   │       └── vols/
│   ├── booking/                  (Tunnel de réservation Front-Office)
│   │   ├── checkout/
│   │   ├── confirmation/[ref]/
│   │   └── travelers/
│   ├── hotels/                   (SERP + détail hôtels Front-Office)
│   │   ├── [id]/
│   │   └── search/
│   ├── pro/                      (Portail B2B partenaires)
│   │   ├── login/
│   │   └── (app)/                (groupe avec layout shell)
│   │       ├── booking/
│   │       │   ├── confirmation/[ref]/
│   │       │   └── travelers/
│   │       ├── change-password/
│   │       ├── clients/
│   │       ├── etablissement/
│   │       ├── factures/
│   │       ├── hotels/
│   │       │   └── [id]/
│   │       ├── marges/
│   │       ├── paiements/
│   │       ├── releve-compte/
│   │       ├── reservations/
│   │       └── utilisateurs/
│   └── api/                      (Route handlers)
│       ├── auth/
│       │   ├── callback/
│       │   └── signout/
│       └── hotels/
│           ├── cities/
│           ├── details/[id]/
│           └── search/
│
├── components/                   (Composants React)
│   ├── admin/                    (Back-office)
│   ├── booking/                  (Tunnel front)
│   ├── pro/                      (Portail B2B)
│   └── ui/                       (shadcn/ui — 26 primitives)
│
├── lib/                          (Logique métier / utilitaires)
│   ├── admin/                    (back-office : actions, data, state machine)
│   ├── auth/                     (profils utilisateurs OTA + B2B)
│   ├── booking/                  (pricing, draft store, server actions, schemas)
│   ├── db/                       (Drizzle client + schema unique)
│   ├── mygo/                     (Client API MyGo Hotels + fixtures + tests)
│   ├── pro/                      (Portail B2B : pricing, fixtures, contexts)
│   └── supabase/                 (Clients SSR/CSR + middleware + Realtime hooks)
│
├── drizzle/                      (Migrations SQL + meta Drizzle)
│   ├── 0000_married_sebastian_shaw.sql
│   ├── manual/                   (Migrations SQL manuelles non-Drizzle)
│   └── meta/
│
├── hooks/                        (Hooks React partagés)
├── public/                       (Assets statiques)
└── scripts/                      (Scripts Node TS)
```

---

## 2. Fichiers racine (configuration & documentation)

| Chemin | Type | Description |
|---|---|---|
| `.env.example` | Config | Gabarit des variables d'environnement (Supabase, DB URL, MyGo creds). |
| `.env.local` | Secret | Secrets locaux non commités (Supabase URL/keys + MYGO_LOGIN/PASSWORD). |
| `.gitignore` | Config | Patterns ignorés par git (node_modules, .next, .env.local). |
| `.prettierignore` | Config | Fichiers exclus du format Prettier. |
| `.prettierrc.json` | Config | Règles Prettier (tabs, semi, trailing commas). |
| `AUDIT_ARCHITECTURE.md` | Doc | Audit Senior + Sécurité initial du projet (RLS, multi-currency, etc.). |
| `ARBORESCENCE.md` | Doc | Ce document. |
| `README.md` | Doc | Guide d'installation / démarrage du projet. |
| `TEST_PLAN_PR7.md` | Doc QA | Plan de test Back-Office (PR #7). |
| `TEST_PLAN_PR9.md` | Doc QA | Plan de test Portail B2B + marges dynamiques (PR #9). |
| `TEST_REPORT_PR9.md` | Doc QA | Rapport d'exécution E2E PR #9 (4/4 assertions PASS). |
| `test-report-pr6.md` | Doc QA | Rapport tunnel booking (PR #6). |
| `test-report-pr7.md` | Doc QA | Rapport back-office Realtime (PR #7). |
| `components.json` | Config | Configuration shadcn/ui (alias, style, base color). |
| `drizzle.config.ts` | Config | Config Drizzle ORM (dialect Postgres, schema path, out dir). |
| `eslint.config.mjs` | Config | Flat config ESLint (Next + TypeScript + React). |
| `next-env.d.ts` | Types | Types ambiants Next.js auto-générés. |
| `next.config.mjs` | Config | Config Next : CSP, HSTS, X-Frame-Options, remotePatterns images. |
| `package.json` | Config | Manifest npm (deps + scripts dev/build/test/db:*). |
| `pnpm-lock.yaml` | Lock | Lockfile pnpm. |
| `postcss.config.mjs` | Config | Config PostCSS — plugin Tailwind v4. |
| `proxy.ts` | Middleware | Middleware Next : refresh session Supabase + redirect non-auth sur `/admin/*` et `/pro/*`. |
| `tsconfig.json` | Config | Config TypeScript strict (paths `@/*` → racine). |
| `tsconfig.tsbuildinfo` | Build | Cache incrémental tsc (généré). |

---

## 3. Pages Web (Next.js App Router)

### 3.1 Front-Office public

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | Page | Homepage publique avec moteur de recherche 7 onglets (Vols/Hôtels/Séjour/Voyages organisés/Activités/Transferts/Omra). |
| `/login` | `app/login/page.tsx` | Page | Connexion super-admin (redirige vers `/admin` après auth). |
| — | `app/layout.tsx` | Layout | Layout racine : `<html>`, fonts, ThemeProvider, Sonner Toaster. |
| — | `app/globals.css` | CSS | Tokens OKLCH (palette Tunisia coral / bleu Méditerranée / or / jasmine) + Tailwind v4 layers. |

### 3.2 Tunnel de réservation Front-Office

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/booking` | `app/booking/page.tsx` | Page | Étape 1 du tunnel : récap offre sélectionnée. |
| `/booking/travelers` | `app/booking/travelers/page.tsx` | Page | Étape 2 : saisie voyageurs (Zod validation matricule TN). |
| `/booking/checkout` | `app/booking/checkout/page.tsx` | Page | Étape 3 : paiement (mode + coupon + Total TTC). |
| `/booking/confirmation/[ref]` | `app/booking/confirmation/[ref]/page.tsx` | Page dyn. | Page de confirmation avec référence publique + badge Realtime. |
| — | `app/booking/loading.tsx` | Loader | Skeleton de transition `loading.tsx` pour `/booking`. |

### 3.3 SERP + Détail hôtels Front-Office (MyGo live)

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/hotels/search` | `app/hotels/search/page.tsx` | Page | SERP hôtels (cards, filtres, tri, pagination) — branchée MyGo live. |
| `/hotels/[id]` | `app/hotels/[id]/page.tsx` | Page dyn. | Détail hôtel public : galerie, équipements, chambres, prix. |
| — | `app/hotels/search/loading.tsx` | Loader | Skeleton SERP. |
| — | `app/hotels/[id]/loading.tsx` | Loader | Skeleton page détail. |

### 3.4 Back-Office super-admin Easy2Book (`/admin/*`)

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/admin` | `app/admin/page.tsx` | Page | Dashboard : KPIs (Vente du Jour, Réservations 7j, statut breakdown) + Realtime. |
| `/admin/reservations` | `app/admin/reservations/page.tsx` | Page | Liste consolidée des réservations toutes-modules (Data Table). |
| `/admin/reservations/hotels` | `app/admin/reservations/hotels/page.tsx` | Page | Vue filtrée réservations hôtels. |
| `/admin/reservations/vols` | `app/admin/reservations/vols/page.tsx` | Page | Vue filtrée réservations vols. |
| `/admin/reservations/omra` | `app/admin/reservations/omra/page.tsx` | Page | Vue filtrée réservations omra. |
| — | `app/admin/layout.tsx` | Layout | Shell back-office (sidebar + header admin + protection rôle). |
| — | `app/admin/loading.tsx` | Loader | Skeleton du dashboard. |

### 3.5 Portail B2B (`/pro/*`) — auth séparée

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/pro/login` | `app/pro/login/page.tsx` | Page | Login dédié partenaires B2B (rôles `partner_owner` / `partner_agent`). |
| `/pro` | `app/pro/(app)/page.tsx` | Page | Home B2B : 4 onglets modules + barre de recherche multi-villes/chaînes. |
| — | `app/pro/(app)/layout.tsx` | Layout | Shell B2B : header crédit Realtime + dropdown 12 sections + footer Help/Emergency. |

### 3.6 Portail B2B — SERP + booking

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/pro/hotels` | `app/pro/(app)/hotels/page.tsx` | Page | SERP B2B : cards avec tabs Résumé/Détails, badge RECOMMENDED, marge appliquée serveur. |
| `/pro/hotels/[id]` | `app/pro/(app)/hotels/[id]/page.tsx` | Page dyn. | Détail hôtel B2B : table chambres + arrangements + sticky bottom bar. |
| `/pro/booking/travelers` | `app/pro/(app)/booking/travelers/page.tsx` | Page | Form voyageurs B2B (coupon + Total TTC éditable + mode paiement). |
| `/pro/booking/confirmation/[ref]` | `app/pro/(app)/booking/confirmation/[ref]/page.tsx` | Page dyn. | Confirmation B2B (référence `B2B-YYYYMMDD-XXXX`). |

### 3.7 Portail B2B — Back-office partenaire

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/pro/reservations` | `app/pro/(app)/reservations/page.tsx` | Page | Mes réservations : Data Table filtrable (n° / état / mot-clé / actions). |
| `/pro/clients` | `app/pro/(app)/clients/page.tsx` | Page | Mes clients finaux (NOM / TEL / EMAIL + search). |
| `/pro/paiements` | `app/pro/(app)/paiements/page.tsx` | Page | Liste règlements (mode, échéance, montants origine/restant). |
| `/pro/factures` | `app/pro/(app)/factures/page.tsx` | Page | Liste factures + avoirs (PDF/proforma/téléchargement). |
| `/pro/releve-compte` | `app/pro/(app)/releve-compte/page.tsx` | Page | Relevé de compte avec range dates + radio Facture/Réservation. |

### 3.8 Portail B2B — Configuration agence

| URL | Fichier | Type | Description |
|---|---|---|---|
| `/pro/etablissement` | `app/pro/(app)/etablissement/page.tsx` | Page | Informations agence : matricule fiscal (regex `\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}`), RC, logo, devise. |
| `/pro/marges` | `app/pro/(app)/marges/page.tsx` | Page | Configuration marges par module (% ou DT fixe) — alimente le moteur de pricing. |
| `/pro/utilisateurs` | `app/pro/(app)/utilisateurs/page.tsx` | Page | Gestion sous-comptes agents (CRUD `partner_users`). |
| `/pro/change-password` | `app/pro/(app)/change-password/page.tsx` | Page | Changement mot de passe partenaire. |

---

## 4. API — Route handlers

| Endpoint | Méthode(s) | Fichier | Description |
|---|---|---|---|
| `/api/auth/callback` | GET | `app/api/auth/callback/route.ts` | Callback OAuth Supabase (échange code → session + redirect rôle). |
| `/api/auth/signout` | POST | `app/api/auth/signout/route.ts` | Détruit la session Supabase puis redirige `/login`. |
| `/api/hotels/cities` | GET | `app/api/hotels/cities/route.ts` | Liste des villes MyGo (proxy + cache TTL). |
| `/api/hotels/search` | GET | `app/api/hotels/search/route.ts` | SERP hôtels : appelle MyGo `HotelSearch`, fallback fixture si creds absents. |
| `/api/hotels/details/[id]` | GET | `app/api/hotels/details/[id]/route.ts` | Détail d'un hôtel (MyGo `HotelDetail`) avec sanitize HTML. |

---

## 5. Composants React

### 5.1 Composants partagés (racine `components/`)

| Fichier | Type | Description |
|---|---|---|
| `components/admin-shell.tsx` | Composant client | Shell back-office Easy2Book (sidebar + topbar + breadcrumbs). |
| `components/booking-engine.tsx` | Composant client | Moteur 7 onglets sur la home (Vols/Hôtels/Séjour/Voyages org./Activités/Transferts/Omra). |
| `components/easy2book-logo.tsx` | Composant SSR | Logo Easy2Book (icône + wordmark optionnel). |
| `components/filter-sidebar.tsx` | Composant client | Sidebar filtres SERP hôtels Front-Office (étoiles, prix, pension, équipements). |
| `components/flash-offers.tsx` | Composant client | Carrousel "Offres flash" sur la home. |
| `components/footer.tsx` | Composant SSR | Footer Front-Office (assurances, contact, réseaux sociaux). |
| `components/header.tsx` | Composant client | Header Front-Office (langue, devise, menu mobile). |
| `components/hotel-card.tsx` | Composant client | Card hôtel SERP Front-Office (image, étoiles, badge dispo, prix). |
| `components/hotel-listings.tsx` | Composant client | Liste de `HotelCard` avec tri / pagination / empty state. |
| `components/hotels-tunisie-search.tsx` | Composant client | Section "Hôtels en Tunisie" sur la home (search box + grille). |
| `components/login-form.tsx` | Composant client | Form de login super-admin (email + password Supabase). |
| `components/omraty-section.tsx` | Composant SSR | Bannière marketing Omra sur la home. |
| `components/search-header.tsx` | Composant client | Bandeau résumé recherche au-dessus de la SERP hôtels. |
| `components/theme-provider.tsx` | Composant client | Wrapper next-themes (mode light/dark/system, persistance localStorage). |
| `components/theme-toggle.tsx` | Composant client | Bouton de bascule clair/sombre dans les headers. |

### 5.2 Composants Back-Office (`components/admin/`)

| Fichier | Type | Description |
|---|---|---|
| `components/admin/reservations-data-table.tsx` | Composant client | Data Table interactive : recherche + filtre module + filtre statut + tri colonnes + actions. |

### 5.3 Composants Tunnel Booking Front-Office (`components/booking/`)

| Fichier | Type | Description |
|---|---|---|
| `components/booking/booking-steps.tsx` | Composant SSR | Stepper 3 étapes (Offre / Voyageurs / Paiement). |
| `components/booking/checkout-form.tsx` | Composant client | Form étape 3 : mode paiement, coupon, conditions générales. |
| `components/booking/travelers-form.tsx` | Composant client | Form étape 2 : voyageurs (nom, prénom, matricule, validation Zod). |
| `components/booking/confirmation-status-badge.tsx` | Composant client | Badge statut Realtime (s'abonne au broadcast Supabase `reservation-<ref>`). |

### 5.4 Composants Portail B2B (`components/pro/`)

| Fichier | Type | Description |
|---|---|---|
| `components/pro/pro-page-shell.tsx` | Composant SSR | Wrapper page B2B avec titre + icône Lucide + actions header. |
| `components/pro/pro-header.tsx` | Composant client | Header B2B : crédit Realtime + dropdown utilisateur 12 sections + langue/devise. |
| `components/pro/pro-footer.tsx` | Composant SSR | Footer B2B Help Desk 24/7 + Emergency 24/7. |
| `components/pro/pro-login-form.tsx` | Composant client | Form login B2B (Supabase auth + redirect rôle partenaire). |
| `components/pro/pro-home-engine.tsx` | Composant client | Wrapper home B2B : `ProModuleTabs` + `ProSearchBar`. |
| `components/pro/pro-module-tabs.tsx` | Composant client | 4 onglets modules (Hôtels jaune / Transfert / Activités orange / Formules bleu). |
| `components/pro/pro-search-bar.tsx` | Composant client | Barre de recherche B2B : autocomplete villes + chaînes, dates FR, multi-chambres. |
| `components/pro/hotels-serp.tsx` | Composant client | SERP B2B : grille de `HotelCard`, tri, filtres, marge appliquée serveur. |
| `components/pro/hotels-filters.tsx` | Composant client | Sidebar filtres SERP B2B (catégorie, pension, prix). |
| `components/pro/hotel-card.tsx` | Composant client | Card hôtel B2B avec tabs Résumé/Détails + badge RECOMMENDED. |
| `components/pro/hotel-summary-card.tsx` | Composant SSR | Card résumé hôtel (used in détail page + booking). |
| `components/pro/hotel-room-selector.tsx` | Composant client | Table sélection chambres : catégorie / occupants / arrangement / prix + sticky bottom bar. |
| `components/pro/booking-travelers-form.tsx` | Composant client | Form voyageurs B2B (référence interne + coupon + Total TTC). |
| `components/pro/reservations-table.tsx` | Composant client | Data Table réservations B2B avec actions Consulter/Imprimer/Annuler. |
| `components/pro/clients-table.tsx` | Composant client | Table clients finaux du partenaire (search NOM/TEL/EMAIL). |
| `components/pro/payments-table.tsx` | Composant client | Liste règlements (mode, échéance, montants, badge type). |
| `components/pro/invoices-table.tsx` | Composant client | Table factures + avoirs avec download/proforma. |
| `components/pro/ledger-report.tsx` | Composant client | Relevé de compte avec range dates + radio + bouton "Générer un rapport". |
| `components/pro/etablissement-form.tsx` | Composant client | Form informations agence (matricule fiscal regex TN, RC, logo). |
| `components/pro/margins-form.tsx` | Composant client | Form marges par module (icônes Lucide Plane/Car/Activity/PackageOpen). |
| `components/pro/users-manager.tsx` | Composant client | CRUD sous-comptes agents (badge rôle Owner/Agent). |
| `components/pro/change-password-form.tsx` | Composant client | Form changement mot de passe (ancien/nouveau/confirm avec eye-toggle). |

### 5.5 shadcn/ui (`components/ui/`)

| Fichier | Type | Primitive |
|---|---|---|
| `components/ui/alert.tsx` | Primitive | Alert (info/warning/destructive). |
| `components/ui/avatar.tsx` | Primitive | Avatar (image + fallback initiales). |
| `components/ui/badge.tsx` | Primitive | Badge (variant default/secondary/destructive/outline). |
| `components/ui/breadcrumb.tsx` | Primitive | Fil d'Ariane composable. |
| `components/ui/button.tsx` | Primitive | Bouton (6 variants × 4 sizes). |
| `components/ui/calendar.tsx` | Primitive | DatePicker react-day-picker (locale `fr`). |
| `components/ui/card.tsx` | Primitive | Card (Header / Title / Description / Content / Footer). |
| `components/ui/checkbox.tsx` | Primitive | Checkbox Radix. |
| `components/ui/collapsible.tsx` | Primitive | Collapsible Radix. |
| `components/ui/command.tsx` | Primitive | Command palette cmdk (utilisée pour autocomplete villes). |
| `components/ui/dialog.tsx` | Primitive | Modal dialog Radix. |
| `components/ui/dropdown-menu.tsx` | Primitive | Menu dropdown Radix (utilisé pour user menu B2B). |
| `components/ui/input.tsx` | Primitive | Input texte. |
| `components/ui/label.tsx` | Primitive | Label form (associé via htmlFor/useId). |
| `components/ui/popover.tsx` | Primitive | Popover Radix. |
| `components/ui/progress.tsx` | Primitive | Progress bar. |
| `components/ui/select.tsx` | Primitive | Select Radix (utilisé pour filtres statut). |
| `components/ui/separator.tsx` | Primitive | Séparateur horizontal/vertical. |
| `components/ui/sheet.tsx` | Primitive | Drawer latéral Radix (utilisé pour menu mobile). |
| `components/ui/sidebar.tsx` | Primitive | Sidebar collapsible shadcn (basée sur Sheet). |
| `components/ui/skeleton.tsx` | Primitive | Skeleton de chargement. |
| `components/ui/slider.tsx` | Primitive | Slider Radix (utilisé pour filtre prix). |
| `components/ui/sonner.tsx` | Primitive | Wrapper Sonner Toaster (notifications). |
| `components/ui/table.tsx` | Primitive | Table HTML stylée shadcn. |
| `components/ui/tooltip.tsx` | Primitive | Tooltip Radix. |

---

## 6. Bibliothèque `lib/` — Logique métier & utilitaires

### 6.1 Admin / Back-office (`lib/admin/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/admin/actions.ts` | Server Actions | `updateReservationStatus` : transition de statut atomique + audit log + revalidate. |
| `lib/admin/dashboard-data.ts` | Data loader | Helpers KPIs Dashboard (vente du jour, résa 7j, breakdown statut). |
| `lib/admin/reservation-status.ts` | Logic pure | State machine des transitions statuts réservation (testable). |
| `lib/admin/reservations-data.ts` | Data loader | Chargement Data Table `/admin/reservations` (Drizzle, jusqu'à 1000 lignes). |
| `lib/admin/__tests__/actions.test.ts` | Test unit. | Tests state machine transitions + revalidate. |
| `lib/admin/__tests__/dashboard-data.test.ts` | Test unit. | Tests calcul KPIs dashboard. |

### 6.2 Authentification (`lib/auth/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/auth/profile.ts` | Data loader | Récupère le profil OTA d'un user Supabase (table `users` Drizzle) — fallback gracieux. |
| `lib/auth/partner-profile.ts` | Data loader | Récupère le profil partenaire B2B + son agence (rôles `partner_owner`/`partner_agent`). |
| `lib/auth/__tests__/profile.test.ts` | Test unit. | Tests résolution profil + fallbacks DB indisponible. |

### 6.3 Tunnel de réservation (`lib/booking/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/booking/actions.ts` | Server Actions | Création réservation : `insertCustomer` + `insertReservation` + extension + audit + email. |
| `lib/booking/draft-store.ts` | Logic pure | Encodage / décodage du brouillon en base64url dans la query string `?d=`. |
| `lib/booking/pricing.ts` | Logic pure | Calcul sous-total / TVA / frais / total TTC / acompte / solde (testable 100%). |
| `lib/booking/schemas.ts` | Validation Zod | Schémas formulaire : voyageur, matricule TN, téléphone, paiement. |
| `lib/booking/__tests__/pricing.test.ts` | Test unit. | Tests pricing (arrondis, TVA, devises). |
| `lib/booking/__tests__/schemas.test.ts` | Test unit. | Tests Zod (regex matricule TN, téléphone international). |

### 6.4 Database (`lib/db/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/db/client.ts` | Drizzle | Factory `getDb()` : client Postgres-js + Drizzle (pool 10, compat Supabase Pooler). |
| `lib/db/schema.ts` | Drizzle | **SOURCE OF TRUTH** — 27 tables : agencies, users, customers, currencies, reservations + 6 extensions, payments, audit_events, catalog_*, pricing_margins, partner_*. |
| `lib/db/README.md` | Doc | Documentation interne du schéma + conventions migrations. |

### 6.5 Client MyGo Hotels (`lib/mygo/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/mygo/index.ts` | Barrel | Export public du module (`getMyGoClient`, mappers, types). |
| `lib/mygo/config.ts` | Config | Lecture des env vars `MYGO_LOGIN`/`MYGO_PASSWORD`/`MYGO_PARTNER`. |
| `lib/mygo/client.ts` | Client HTTP | `MyGoClient` : timeout + retries + circuit breaker + Zod validation. |
| `lib/mygo/schemas.ts` | Validation Zod | Schémas permissifs des réponses brutes MyGo. |
| `lib/mygo/types.ts` | Types | DTOs propres exposés à l'UI (City, Hotel, Boarding, Currency). |
| `lib/mygo/mappers.ts` | Logic pure | Mappers : Zod brut → DTO propre. |
| `lib/mygo/facets.ts` | Logic pure | Calcul facets dynamiques (étoiles, pension, équipements). |
| `lib/mygo/sanitize-html.ts` | Logic pure | Décodage HTML double-encodé renvoyé par MyGo. |
| `lib/mygo/cache.ts` | Cache | Cache mémoire process-local avec TTL (Vercel-compat). |
| `lib/mygo/circuit-breaker.ts` | Resilience | Circuit breaker (5 échecs / 60s → open 2min). |
| `lib/mygo/errors.ts` | Errors | Hiérarchie `MyGoError` (NetworkError, AuthError, ValidationError). |
| `lib/mygo/use-hotel-search.ts` | Hook client | `useHotelSearch` : encapsule l'appel `/api/hotels/search` + abort. |
| `lib/mygo/__fixtures__/*.json` | Fixtures | 6 réponses MyGo réelles capturées (hotelsearch / hoteldetail / listcity / listcurrency / listtag / listboarding / error_auth). |
| `lib/mygo/__tests__/mappers.test.ts` | Test unit. | Tests mappers avec fixtures. |
| `lib/mygo/__tests__/facets.test.ts` | Test unit. | Tests calcul facets. |
| `lib/mygo/__tests__/sanitize-html.test.ts` | Test unit. | Tests décodage HTML. |

### 6.6 Portail B2B (`lib/pro/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/pro/destinations.ts` | Data statique | 36 villes TN + 10 chaînes hôtelières pour l'autocomplete `/pro` (compteurs indicatifs). |
| `lib/pro/hotels-fixture.ts` | Data statique | Catalogue mocké de 25 hôtels B2B (Hammamet, Sousse, Djerba, …) en prix net agence. |
| `lib/pro/rooms.ts` | Data statique | Inventaire chambres mocké (3-5 catégories × 1-3 arrangements par hôtel). |
| `lib/pro/mock-tables.ts` | Data statique | Mocks Data Tables back-office partenaire (réservations, clients, paiements, factures). |
| `lib/pro/format.ts` | Logic pure | `formatTND` : virgule décimale française + 3 décimales (`841,253 DT`). |
| `lib/pro/pricing.ts` | Logic pure | **Moteur de marge B2B** : applique `pricing_margins` (% ou DT fixe) avec fallback `DEFAULT_MARGINS`. |
| `lib/pro/booking-context.ts` | Logic pure | Décodage du paramètre `?offers=<id>:<qty>,…` du tunnel B2B. |
| `lib/pro/server-context.ts` | Helper SSR | Combo `createServerSupabase` + `getCurrentPartnerProfile` + `getMarginsForAgency` partagé. |
| `lib/pro/__tests__/pricing.test.ts` | Test unit. | 8 tests : %, DT fixe, fallback, modules, arrondis. |

### 6.7 Supabase (`lib/supabase/`)

| Fichier | Type | Description |
|---|---|---|
| `lib/supabase/client.ts` | Client CSR | `createBrowserSupabase()` pour composants `"use client"`. |
| `lib/supabase/server.ts` | Client SSR | `createServerSupabase()` pour Server Components / Server Actions / Route Handlers. |
| `lib/supabase/middleware.ts` | Middleware | `updateSession()` : refresh session + redirect `/admin` et `/pro` non-auth. |
| `lib/supabase/broadcast.ts` | Helper SSR | Émission d'événements Supabase Realtime Broadcast (bypass RLS). |
| `lib/supabase/use-realtime-broadcast.ts` | Hook client | Souscription à un canal Broadcast (utilisé par `ConfirmationStatusBadge`). |
| `lib/supabase/use-realtime-table.ts` | Hook client | Souscription aux changements d'une table (INSERT/UPDATE/DELETE). |

### 6.8 Utilitaires racine `lib/`

| Fichier | Type | Description |
|---|---|---|
| `lib/utils.ts` | Helper | `cn()` : merge classes Tailwind avec clsx + tailwind-merge. |

---

## 7. Hooks React (`hooks/`)

| Fichier | Type | Description |
|---|---|---|
| `hooks/use-mobile.ts` | Hook client | `useIsMobile()` : breakpoint 768px via `matchMedia`. |

---

## 8. Base de données — Migrations Drizzle (`drizzle/`)

| Fichier | Type | Description |
|---|---|---|
| `drizzle/0000_married_sebastian_shaw.sql` | Migration auto | Migration initiale Drizzle : crée tous les enums + 21 tables OTA (agencies, users, customers, reservations + extensions, payments, audit, catalogs). |
| `drizzle/manual/0001_rls_policies.sql` | Migration manuelle | Active RLS sur toutes les tables métier + policies `agency_id = current_setting('app.current_agency')`. |
| `drizzle/manual/0002_currencies_public_read.sql` | Migration manuelle | Policy SELECT publique sur `currencies` (table de référence). |
| `drizzle/manual/0002_seed_currencies.sql` | Seed SQL | Seed des 4 devises supportées (TND, EUR, USD, DZD). |
| `drizzle/manual/0003_enable_realtime_reservations.sql` | Migration manuelle | Active la publication Realtime Postgres sur `reservations`. |
| `drizzle/manual/0004_partner_b2b_portal.sql` | Migration manuelle | Crée `pricing_margins`, `partner_invoices`, `partner_payments`, `partner_credit_movements` + RLS + seed agence test. |
| `drizzle/meta/0000_snapshot.json` | Meta Drizzle | Snapshot du schéma au moment de `0000`. |
| `drizzle/meta/_journal.json` | Meta Drizzle | Journal des migrations appliquées. |

### 8.1 Tables Postgres exposées par `lib/db/schema.ts`

| Table | Description |
|---|---|
| `agencies` | Agences (OTA + partenaires B2B). |
| `users` | Utilisateurs (super_admin, manager, agents, partner_owner, partner_agent). |
| `customers` | Clients finaux (par agence). |
| `currencies` | Devises supportées (TND, EUR, USD, DZD). |
| `exchange_rates` | Taux de change historiques (TND ↔ devises). |
| `reservations` | Table polymorphe : tronc commun + colonne `module`. |
| `reservation_hotel` | Extension réservation hôtel (1-1). |
| `reservation_flight` | Extension réservation vol (1-1). |
| `reservation_package` | Extension réservation séjour (1-1). |
| `reservation_activity` | Extension réservation activité (1-1). |
| `reservation_transfer` | Extension réservation transfert (1-1). |
| `reservation_omra` | Extension réservation omra (1-1). |
| `payments` | Paiements (acompte + solde + refunds), multi-devises. |
| `psp_webhooks` | Webhooks bruts PSP (audit). |
| `audit_events` | Journal d'audit immuable (qui a fait quoi, quand). |
| `catalog_packages` | Catalogue séjours organisés. |
| `catalog_package_departures` | Départs disponibles par séjour. |
| `catalog_activities` | Catalogue excursions / activités. |
| `catalog_activity_sessions` | Sessions disponibles par activité. |
| `catalog_transfer_zones` | Zones tarifaires transferts. |
| `catalog_transfer_pricing` | Grille tarifaire transferts (zone × véhicule). |
| `catalog_vehicles` | Flotte véhicules pour transferts. |
| `catalog_drivers` | Chauffeurs assignables aux transferts. |
| `pricing_margins` | **Marges B2B par agence × module × type (% ou DT fixe)**. |
| `partner_invoices` | Factures partenaire (Facture / Avoir / Proforma). |
| `partner_payments` | Règlements partenaire (mode, échéance). |
| `partner_credit_movements` | Mouvements du compte de dépôt partenaire (crédit/débit/refund). |

---

## 9. Scripts (`scripts/`)

| Fichier | Type | Description |
|---|---|---|
| `scripts/seed-mock-data.ts` | Script Node TS | Seed mock : 60 customers + 250 reservations + extensions + ~180 payments — exécutable `pnpm tsx scripts/seed-mock-data.ts`. |

---

## 10. Assets statiques (`public/`)

| Fichier | Type | Description |
|---|---|---|
| `public/easy2book-logo.png` | Image | Logo Easy2Book wordmark. |
| `public/icon.svg` | Icône | Icône SVG (favicon vectoriel). |
| `public/icon-dark-32x32.png` | Icône | Favicon mode sombre 32×32. |
| `public/icon-light-32x32.png` | Icône | Favicon mode clair 32×32. |
| `public/apple-icon.png` | Icône | Apple touch icon. |
| `public/placeholder.jpg` | Placeholder | Image placeholder JPG. |
| `public/placeholder.svg` | Placeholder | Image placeholder SVG. |
| `public/placeholder-logo.png` | Placeholder | Logo placeholder PNG. |
| `public/placeholder-logo.svg` | Placeholder | Logo placeholder SVG. |
| `public/placeholder-user.jpg` | Placeholder | Avatar placeholder. |

---

## 11. Récapitulatif quantitatif

| Catégorie | Quantité |
|---|---|
| Pages Web (`page.tsx`) | **32** |
| Layouts (`layout.tsx`) | **3** (root + admin + pro) |
| Loading skeletons (`loading.tsx`) | **4** |
| API Route handlers (`route.ts`) | **5** |
| Composants applicatifs (`components/*` hors UI) | **38** |
| Primitives shadcn/ui (`components/ui/`) | **26** |
| Modules `lib/` (fichiers `.ts` hors tests/fixtures) | **44** |
| Tests unitaires (`__tests__/`) | **9 fichiers** (71 tests à l'exécution) |
| Fixtures MyGo JSON | **7** |
| Migrations SQL (auto + manuelles) | **6** |
| Tables Postgres | **27** |
| Hooks React | **3** (`use-mobile`, `use-realtime-broadcast`, `use-realtime-table`) |
| Scripts Node | **1** (`seed-mock-data`) |
| Assets statiques | **10** |
| Fichiers de configuration racine | **14** |
| Documents Markdown | **8** |

---

## 12. Notes architecture

- **Middleware** : le fichier est nommé `proxy.ts` (export `proxy` + `config` matcher). Convention Next standard = `middleware.ts` ; vérifier si Next 15 picks up `proxy.ts` automatiquement ou si un renommage `mv proxy.ts middleware.ts` est nécessaire pour activer la protection des routes `/admin` et `/pro` en production.
- **Multi-tenant** : toutes les tables métier ont `agency_id` NOT NULL + index ; RLS Postgres garantit l'isolation cross-agence par construction (cf. `drizzle/manual/0001_rls_policies.sql` et `0004_partner_b2b_portal.sql`).
- **Marges B2B** : moteur dans `lib/pro/pricing.ts` ; appliqué côté serveur sur SERP `/pro/hotels`, détail `/pro/hotels/[id]`, tunnel `/pro/booking/travelers` ; fallback `DEFAULT_MARGINS` (hôtel 10%, vols 25 DT fixe, omra 8%, packages 12%, activités 15%, transferts 10 DT fixe).
- **Auth** : deux flux séparés (`/login` super-admin → `/admin`, `/pro/login` partenaires → `/pro`). Discrimination via `user_role` enum (`super_admin`, `manager`, `agent_*`, `partner_owner`, `partner_agent`).
- **Tests** : `pnpm test` exécute 71 tests unitaires couvrant pricing, schemas Zod, state machine statuts, mappers/facets MyGo, sanitize HTML, profils auth.
- **CI** : 2/2 checks Vercel verts sur la branche `devin/1778834500-b2b-portal` (PR #8).
