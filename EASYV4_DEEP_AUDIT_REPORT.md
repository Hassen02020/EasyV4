# Easy2Book — Audit approfondi et validation réelle

> Généré le 2026-08-20, branche `claude/easy2book-v6-modernization-7gyb5v`,
> commits jusqu'à `6f23213`. Complète `WALLET_PAYMENT_AUDIT_REPORT.md`
> (audit wallet/paiement, 20 findings, verdict NOT READY) sans le
> dupliquer — référencé où pertinent plutôt que réécrit.
>
> **Portée réelle** : audit statique complet (phase 1, ce document) —
> code, routes, middleware, RLS (sweep complet des 68 tables `public`),
> auth/rôles, architecture, moteur hôtel/MyGo, wallet, UX. Aucun compte de
> test authentifié n'a été créé (`.env.local` absent de ce sandbox, aucune
> clé `service_role` demandée ni utilisée) — la phase 2 (test authentifié)
> reste à faire, spécifiée en §11/§J.
>
> **Un problème CRITICAL a été trouvé ET corrigé pendant cette phase 1** —
> pas seulement documenté : `agencies` n'avait aucune policy RLS UPDATE
> pour une session tenant normale, ce qui faisait que **le débit wallet
> d'une vraie réservation B2B ne s'appliquait jamais réellement** (voir
> commit `6f23213`). Conformément à la consigne ("corrige uniquement les
> problèmes sûrs et clairement identifiés"), c'est le seul correctif de
> fond appliqué dans cette passe — le reste est documenté avec
> recommandation, pas corrigé à l'aveugle.

---

## A. Executive Summary

| # | Question | Réponse |
|---|---|---|
| Maturité générale | Architecture multi-tenant RLS **solide et globalement bien conçue** (pattern `current_agency_id()/is_super_admin()` cohérent sur 55+ tables), mais avec des trous d'application concrets — dont un CRITICAL qui cassait silencieusement le débit wallet B2B en production. |
| Force principale | Le moteur hôtel Tunisie (MyGo) est réellement câblé (BookingCreation/Cancellation réelles, prix/dispo revalidés fournisseur avant écriture DB, compensation par annulation si l'écriture locale échoue après confirmation fournisseur) — pas un mock. |
| Risque principal résiduel | **Aucun checkout B2C autonome n'existe** (`WALLET_PAYMENT_AUDIT_REPORT.md`, WALLET-02) — `createReservationFromDraft` exige un profil `partner_owner`/`partner_agent`/`super_admin`. Un visiteur B2C anonyme ne peut jamais finaliser de réservation. |
| Sécurité | RLS activée et forcée sur la quasi-totalité des tables métier réelles ; 1 CRITICAL trouvé+corrigé cette passe (agencies), 1 HIGH trouvé cette passe (suppliers — policy trop large), plusieurs tables catalogue/legacy encore RLS-désactivées (documenté, non corrigé à l'aveugle par prudence). |
| Duplication | `/b2b/*` et `/pro/(app)/*` sont deux portails B2B parallèles et fonctionnels (pas de bug de sécurité dans `/b2b`), `/b2b` étant un sous-ensemble plus ancien (dashboard + wallet uniquement) du `/pro` plus complet — candidat clair à une consolidation, pas une urgence. |
| Code mort | Confirmé : Store B/C wallet (`lib/wallet/actions.ts`, `lib/finance/wallet-service.ts`), `lib/booking/workflow-pipeline.ts`, `lib/repositories/*.ts` (5 fichiers), `lib/audit/logger.ts` — zéro appelant live. Plus un ensemble de **tables orpheline "template"** (`bookings`, `accommodations`, `transport_services`, `locations`, `services`, `profiles`, `inventory`) absentes de `lib/db/schema.ts` — vestiges du template de départ jamais nettoyés côté DB. |
| Tests | 190/190 unitaires (dont 12 re-vérifiés après le fix P0), gates clean (typecheck/lint/build) à chaque commit. Aucun test d'intégration/E2E authentifié exécuté (bloqué par l'absence d'environnement — voir §11). |

---

## B. Critical Findings

| ID | Sévérité | Composant | Statut |
|---|---|---|---|
| AUDIT-01 | **P0** | RLS `agencies` — aucune policy UPDATE tenant | ✅ **CORRIGÉ** (commit `6f23213`) |
| AUDIT-02 | **P0 (hérité)** | Aucun checkout B2C fonctionnel | ⚠️ Non résolu — décision produit requise (`WALLET_PAYMENT_AUDIT_REPORT.md` WALLET-02) |
| AUDIT-03 | P1 | RLS `suppliers` — policy ALL trop permissive (tout utilisateur authentifié, pas de scoping) | ⚠️ Documenté, non corrigé |
| AUDIT-04 | P1 | ~20 fichiers `getDb()` bruts sans contexte tenant dans `/admin` et `/pro` (hérité du stress-test antérieur, non re-vérifié cette passe) | ⚠️ Non résolu |
| AUDIT-05 | P2 | `/b2b/*` duplique une partie de `/pro/(app)/*` | ⚠️ Documenté, recommandation §I |
| AUDIT-06 | P2 | Tables catalogue/legacy RLS-désactivées (`omra_packages`, `omra_allotments`, `inventory_locks`, `yield_rules`, `products`, `currencies`, `audit_logs`) | ⚠️ Documenté, non corrigé à l'aveugle |
| AUDIT-07 | P3 | Tables orphelines "template" en DB, absentes du schéma applicatif | ⚠️ Documenté |

### AUDIT-01 — RLS `agencies` : aucune policy UPDATE tenant (P0, CORRIGÉ)

- **Root cause** : `agencies` n'a que 2 policies — `agencies_admin_write` (cmd=ALL, qual=`is_super_admin()`) et `agencies_select` (cmd=SELECT). Aucune policy ne couvre UPDATE pour une session tenant (`isSuperAdmin: false`).
- **Reproduction** : `debitPartnerCredit()` (appelée pour CHAQUE réservation B2B réelle, toujours en `isSuperAdmin: false`) faisait `SELECT...FOR UPDATE` (OK) → `INSERT` ledger (OK) → `UPDATE agencies SET deposit_balance=...` (filtré silencieusement par RLS : 0 ligne affectée, AUCUNE exception). Le code n'inspectait jamais le résultat de cet UPDATE.
- **Impact réel** : `agencies.deposit_balance` ne pouvait **jamais** diminuer suite à une vraie réservation B2B. Seules les recharges (toujours en `isSuperAdmin: true`) modifiaient réellement la colonne. Le ledger enregistrait des débits avec un `balance_after` fictif qui ne correspondait à aucune écriture réelle — une agence partenaire pouvait réserver indéfiniment sans jamais épuiser son solde réellement affiché.
- **Vérifié en production** (lecture seule, agence existante remise à sa propre valeur — no-op réel) : le nouveau canal fonctionne pour sa propre agence, rejette (FORBIDDEN, 42501) une tentative sur une autre agence.
- **Correction** : `drizzle/manual/0020_agency_wallet_balance_write_gap.sql` — fonction `SECURITY DEFINER` `set_agency_deposit_balance()`, seul canal désormais utilisé par les 3 points d'écriture (`debitPartnerCredit`, `creditRechargeRequest`, `adminRechargeWallet`). Détail complet : commit `6f23213`.
- **Tests** : 12 tests `lib/pro/__tests__/booking-actions.test.ts` re-vérifiés, mocks mis à jour pour refléter le nouveau canal (l'ancien `tx.update(agencies)` lève désormais une erreur explicite s'il est jamais réappelé par erreur).
- **Risque résiduel** : aucun test de concurrence réel exécuté contre production (pas de `DATABASE_URL` dans ce sandbox) — la garantie FOR UPDATE + fonction SECURITY DEFINER est correcte par construction (lecture de code + policies), pas re-prouvée par une vraie course concurrente.

### AUDIT-02 — Aucun checkout B2C fonctionnel (P0 hérité, non résolu)

Déjà documenté en détail dans `WALLET_PAYMENT_AUDIT_REPORT.md` (WALLET-02). Résumé : `createReservationFromDraft` (utilisée par le storefront public ET `/pro`) échoue systématiquement pour un visiteur B2C anonyme — `getCurrentPartnerProfile()` retourne `null` pour tout rôle autre que `partner_owner`/`partner_agent`/`super_admin`. Aucun concept de wallet B2C n'existe dans le schéma. **Non résolu délibérément** — nécessite une décision produit (guest checkout + PSP, wallet client dédié, ou storefront volontairement consultation-seule) avant toute implémentation.

### AUDIT-03 — RLS `suppliers` trop permissive (P1)

- **Policy actuelle** : `suppliers_staff_access`, cmd=ALL, qual = `is_super_admin() OR (current_setting('app.current_user_id', true) <> '')` — c'est-à-dire : **tout utilisateur authentifié passé par `withTenantContext`, quel que soit son rôle ou son agence**, peut lire ET écrire n'importe quelle ligne `suppliers`.
- **Vérification applicative** : le seul point d'écriture live trouvé (`app/admin/suppliers/new/page.tsx`) est bien sous `/admin/*`, protégé par le gate OTA staff (middleware + layout). **Pas d'exploitation possible via l'UI actuelle.**
- **Risque réel** : défense en profondeur absente — un accès direct à l'API/DB (bug futur, endpoint mal protégé, appel Supabase direct côté client) permettrait à N'IMPORTE QUEL partenaire B2B connecté de lire/modifier la configuration fournisseur (endpoints, éventuels identifiants, structure de commission).
- **Recommandation** : restreindre l'écriture à `is_super_admin()` (comme `agencies_admin_write`), garder une lecture plus large si le moteur de recherche en a besoin côté serveur (à vérifier au cas par cas selon ce que contient réellement la table). Non corrigé cette passe — nécessite de confirmer qu'aucun besoin de lecture large légitime n'existe avant de resserrer.

---

## C. Security Audit — Authentification / Autorisation / RLS / IDOR

### C.1 — Carte Route → Layout → Guard → Auth → Role

| Espace | Entrée non authentifié | Guard middleware | Guard layout | Fonction de résolution identité | Rôles acceptés |
|---|---|---|---|---|---|
| B2C public (`/`, `/vols`, `/hotels-monde`, `/omra`, `/packages`, `/car`, `/transferts*`, `/booking/*`) | Accès libre | Aucun | Aucun | — | Anonyme (mais `/booking/*` finit par exiger un profil partenaire — voir AUDIT-02) |
| `/pro/*` | → `/pro/login?next=...` (côté layout, PAS middleware) | **Aucun** — `/pro` n'est PAS dans le matcher `ADMIN_ROUTES` de `proxy.ts` | `app/pro/(app)/layout.tsx` : `getCurrentPartnerProfile()`, sinon `redirect("/admin")` | `lib/auth/partner-profile.ts` (bootstrap `resolve_session_context()` puis `withTenantContext`) | `partner_owner`, `partner_agent`, `super_admin` (preview) |
| `/b2b/*` | → `/pro/login?next=/b2b` (pas de `/b2b/login` propre) | **Aucun** | `app/b2b/layout.tsx` : `getCurrentAdminProfile()` + check rôle explicite | `lib/auth/profile.ts` (même bootstrap `resolve_session_context()`) | `partner_owner`, `partner_agent` uniquement |
| `/admin/*` | → `/login` | **Oui** — `proxy.ts` : requête directe `supabase.from("users").select("role, agencies(agency_type)")` (PostgREST, `auth.uid()` résout correctement ici) + `isAllowedIntoAdmin()` | `app/admin/layout.tsx` (non lu cette passe — supposé même pattern, à vérifier) | Query PostgREST directe | `super_admin`/`manager`/`agent_resa`/`agent_compta`/`agent_excursions` **ET** `agency_type='ota'` (`lib/auth/admin-gate.ts`) |
| `/mutuelle/*` | → `/mutuelle/login` | Aucun | `app/mutuelle/layout.tsx` : `getCurrentAdminProfile()` + cookie de rôle | Double source (cookie OU DB) | `mutuelle` uniquement, redirige intelligemment vers `/admin` ou `/b2b` si mauvais rôle détecté |

**Finding AUDIT-08 (P2)** : `/pro/*` et `/b2b/*` n'ont **aucune protection middleware**, contrairement à `/admin/*`. Le layout reste la seule ligne de défense pour ces deux espaces. Ce n'est pas un bug en soi (`getCurrentPartnerProfile`/`getCurrentAdminProfile` sont RLS-safe et correctement implémentées), mais ça casse la défense-en-profondeur à 2 couches que `/admin` a — si un futur refactor introduit un bug dans UN SEUL de ces deux layouts, rien d'autre ne rattrape l'accès. Recommandation : étendre `proxy.ts` pour couvrir `/pro` et `/b2b` avec un guard minimal (authentification + résolution de rôle), symétrique à `/admin`.

**Finding AUDIT-09 (P3, cosmétique/dette)** : `/b2b/layout.tsx` et `app/b2b/page.tsx` importent `getCurrentAdminProfile` de `lib/auth/profile.ts` — une fonction nommée "Admin" mais en réalité générique (résout n'importe quel rôle). Le nommage prête à confusion (on s'attend à ce qu'une fonction "Admin profile" soit réservée au back-office). Pas un bug, mais un piège pour un futur lecteur.

### C.2 — Scénarios testés statiquement (non exécutés en live — voir §11)

| Scénario | `/pro` | `/b2b` | `/admin` | `/mutuelle` |
|---|---|---|---|---|
| Non connecté | Redirige `/pro/login` | Redirige `/pro/login?next=/b2b` | Redirige `/login` (middleware) | Redirige `/mutuelle/login` |
| `partner_agent` (agence A) | ✅ Autorisé, scope agence A | ✅ Autorisé, scope agence A | ❌ Refusé (`agency_type` ≠ ota) | ❌ Refusé → redirigé `/b2b` |
| `partner_owner` (agence A) | ✅ Autorisé, scope agence A | ✅ Autorisé, scope agence A | ❌ Refusé | ❌ Refusé → redirigé `/b2b` |
| Rôle staff OTA (`manager`, etc.) | `getCurrentPartnerProfile` retourne `null` (rôle non partenaire, pas `super_admin`) → `redirect("/admin")` | Layout refuse explicitement (rôle ≠ partner_*) → `redirect("/login")` | ✅ Autorisé (si `agency_type='ota'`) | ❌ Refusé |
| `super_admin` | ✅ Autorisé, mode "preview" (1ère agence partner trouvée) | Refusé par le check explicite du layout (rôle ≠ partner_*) — **incohérence avec `/pro` qui accepte le super_admin en preview** | ✅ Autorisé | Redirigé `/admin` |
| `mutuelle` | Non testé statiquement (rôle absent de `getCurrentAdminProfile`'s union de types déclarée — potentiel refus silencieux) | Idem | Idem | ✅ Autorisé |
| Rôle inexistant / NULL | `getCurrentPartnerProfile` → `null` → `/admin` (puis refusé côté admin-gate → `/unauthorized`, en 2 sauts) | Refusé | Refusé | Refusé → `/login/select` |
| Utilisateur désactivé (`status='suspended'`) | `resolve_session_context()` filtre déjà sur `status='active'` en amont (bootstrap) → traité comme non résolu → `null` → mêmes chemins que "rôle inexistant" | Idem | Idem (mais passe par une requête PostgREST directe côté middleware — à vérifier que `users.status` y est bien filtré aussi, PAS confirmé cette passe) | Idem |

**Finding AUDIT-10 (P3)** : `/pro` accepte un `super_admin` en mode preview (1ère agence `partner` trouvée), mais `/b2b` le refuse explicitement (son check est `role !== "partner_owner" && role !== "partner_agent"` — sans exception super_admin). Incohérence mineure entre les deux portails B2B parallèles, symptôme direct de AUDIT-05 (duplication).

**BLOCKED — nécessite environnement authentifié** : tout ce tableau est une lecture de code, pas un test exécuté. Pour reproduire réellement chaque scénario, il faut les 3 comptes de test spécifiés en §11/§J.

### C.3 — RLS : sweep complet (68 tables `public`)

Résultat brut de `SELECT relrowsecurity, relforcerowsecurity, count(policies)` sur toutes les tables :

**Correctement protégées (RLS + FORCE + policy tenant/admin cohérente)** — 46 tables, dont toutes les tables métier réelles utilisées par l'app (`agencies`, `customers`, `reservations`, `reservation_*` ×9, `payments`, `partner_credit_movements`, `partner_invoices`, `partner_payments`, `wallet_recharge_requests`, `wallets`, `wallet_transactions`, `omra_pilgrims`, `users`, `audit_events`, `catalog_*` ×8, `car_*` ×5, `journal_entries/lines`, `margin_rules`, `pricing_margins`, `product_inventory`, `psp_webhooks`, `payment_events`, `supplier_logs/modules`, `validation_*`, `wallet_accounts/ledger` [Store C, mort mais protégé]).

**Trou trouvé et corrigé cette passe** : `agencies` (AUDIT-01, ci-dessus — RLS était bien active, c'est la POLICY UPDATE qui manquait, un trou plus subtil qu'un simple "RLS désactivée").

**Policy trop permissive** : `suppliers` (AUDIT-03).

**RLS activée mais AUCUNE policy** (bloque tout accès non-owner, y compris légitime) : `inventory`, `locations`, `profiles`, `services`. **Aucune de ces 4 tables n'est déclarée dans `lib/db/schema.ts`** — l'application ne les utilise jamais, donc ce blocage total est actuellement sans impact réel, mais confirme que ce sont des reliquats orphelins (voir AUDIT-07).

**RLS totalement désactivée** :
| Table | Utilisée par l'app ? | Commentaire |
|---|---|---|
| `wallet_recharge_requests` | — | ✅ Déjà corrigé (migration 0015, `WALLET_PAYMENT_AUDIT_REPORT.md`) |
| `omra_pilgrims` | — | ✅ Déjà corrigé (migration 0017, PII passeport/médical) |
| `payment_events` | — | ✅ Déjà corrigé (migration 0018) |
| `omra_packages`, `omra_allotments`, `omra_flights`, `omra_room_allocations`, `omra_hotels` | ✅ Oui (`lib/omra/booking-actions.ts`, tables catalogue) | Non corrigé — `omra_packages`/`omra_allotments` sont probablement du catalogue public (recherche B2C sans session), verrouiller à l'aveugle risquerait de casser la navigation ; `omra_flights`/`omra_room_allocations` n'ont pas de colonne `agency_id` directe (policy à jointure à concevoir séparément) |
| `inventory_locks` | ✅ Oui (`lib/booking/inventory.ts::cleanExpiredLocks`, cron) | Non corrigé — cron utilise `getDb()` brut, activer RLS sans migrer vers `withSystemContext()` d'abord casserait le cron (même piège que `payment_events` avant sa migration) |
| `yield_rules` | ✅ Oui (`lib/yield/*`, marges dynamiques) | Non vérifié en profondeur cette passe |
| `products` | Déclaré dans `lib/db/schema.ts` mais aucun appelant live trouvé (grep) | Probablement mort, à confirmer |
| `currencies` | ✅ Oui (sélecteur de devise) | A une policy `currencies_public_read` définie mais RLS non activée dessus → policy inerte (`policy_exists_rls_disabled`), la table est de facto en lecture/écriture libre pour tout `authenticated` (`GRANT` large hérité de la migration 0001) |
| `audit_logs` | Aucun appelant live trouvé | Probablement mort (doublon de `audit_events`, qui lui est protégé) |

**Recommandation générale** : traiter `currencies` en priorité dans les tables RLS-désactivées restantes (c'est la seule qui a un vrai trafic public actif et un `GRANT` large existant — un `INSERT`/`UPDATE` arbitraire y est possible aujourd'hui pour tout compte authentifié), puis `omra_*`/`inventory_locks`/`yield_rules` après vérification des besoins de lecture publique et migration des crons vers `withSystemContext()`.

---

## D. Business Logic Audit — Booking / Wallet / Pricing / Vouchers / Invoices

Couvert en détail dans `WALLET_PAYMENT_AUDIT_REPORT.md` (20 findings) + AUDIT-01 ci-dessus (le trou RLS qui rendait tout ça théorique plutôt que réel). Résumé de ce qui est **réellement vérifié fonctionnel** après les deux passes d'audit cumulées :

- Débit atomique + verrouillé + désormais **réellement persisté** (AUDIT-01) ✅
- Idempotence débit (clé Redis + `FOR UPDATE`) ✅
- Aucun double débit possible dans une même transaction (verrou pessimiste) ✅ — non re-testé sous concurrence réelle (BLOCKED, pas de DB locale)
- Rollback complet si erreur après débit (transaction unique réservation+débit) ✅
- Ledger cohérent avec le solde réel — **cassé avant AUDIT-01, maintenant cohérent** ✅
- Voucher/facture uniquement après confirmation réelle (webhook PSP fonctionnel, génération facture idempotente) — voir `WALLET_PAYMENT_AUDIT_REPORT.md` §7/§9
- CHECK `deposit_balance >= 0` en base (défense en profondeur, migration 0016) ✅

**Non couvert / résiduel** : aucun test de concurrence réel exécuté (2 réservations simultanées épuisant le même solde) — la garantie repose sur `SELECT...FOR UPDATE`, correcte par construction Postgres, mais jamais prouvée par une vraie course en production dans cette session (BLOCKED — nécessite `DATABASE_URL`).

---

## E. Hotel Engine Audit — Recherche / MyGo / Booking

Déjà construit et audité dans les phases précédentes de cette session (PR #28, #29 — non re-détaillé ici) :

- Recherche : destination, dates, chambres, adultes, enfants (avec âges), multi-room — schéma `HotelSearchRequest` fidèle au contrat MyGo réel (PDF fournisseur).
- **Revalidation prix/dispo avant réservation** : `confirmHotelWithProvider()` (`lib/booking/actions.ts`) appelle MyGo `BookingCreation` **avant toute écriture DB** — si le prix/la dispo a changé côté fournisseur, aucune réservation locale n'est créée. Le total MyGo (`authoritativeUnitPrice`) fait foi sur le prix soumis par le draft client (non signé, non fiable à 100%).
- **Cas ambigu (timeout réseau)** : `reconcileAmbiguousBooking()` interroge `BookingList` en lecture seule pour éviter de créer une réservation locale en double si le fournisseur avait en fait confirmé malgré une réponse perdue — n'adopte le résultat que sur correspondance univoque, sinon remonte un état explicitement "ambigu" plutôt que de deviner.
- **Compensation** : si l'écriture DB locale échoue APRÈS confirmation MyGo (ex: débit wallet insuffisant détecté après coup — cas rare mais possible), tentative d'annulation (`cancelBooking`) côté fournisseur ; si l'annulation échoue aussi, message explicite au support plutôt qu'un échec silencieux.
- **Devise** : `HOTEL_SETTLEMENT_CURRENCY = "TND"` codée en dur côté client MyGo — élimine le vecteur de falsification de devise trouvé et corrigé lors de l'audit initial (le draft client ne peut plus influencer la devise de règlement).
- **Virtual MyGo Supplier** (PR #29) : 15 scénarios d'injection de panne testables via le même adaptateur que le vrai MyGo (pas une architecture parallèle) — `MYGO_MODE=virtual`.

**Non re-vérifié cette passe** : cache, retry/backoff exact, pagination, tri — ces aspects étaient hors du périmètre des sessions précédentes centrées sur la correction booking/paiement plutôt que sur la recherche elle-même.

---

## F. UX/UI Audit

- **Homepage + moteur de recherche** : refonte complète effectuée cette session (commit `f4fed92`) — carte flottante glassmorphism desktop, bottom-sheet mobile réel (`vaul`, jamais utilisé avant), système de champ unifié sur les 7 modules (y compris Hôtels Tunisie/MyGo, qui avait un style différent avant). Vérifié visuellement (Playwright, 1440px et 390px).
- **Reste du produit** (détail hôtel, checkout, `/pro/*`, `/admin/*`) : **non audité visuellement cette passe** — lecture de code uniquement pour les aspects fonctionnels (voir sections C/D/E), pas de capture d'écran ni de revue ergonomique dédiée. BLOCKED pour tout ce qui est authentifié (`/pro`, `/admin`, `/b2b`).
- Recommandation explicite du donneur d'ordre respectée : **pas de refonte visuelle hors moteur de recherche/homepage** dans cette passe — le reste du produit garde son apparence actuelle tant qu'aucune demande explicite n'est faite.

---

## G. Architecture Audit

| Élément | Statut | Recommandation |
|---|---|---|
| `lib/wallet/actions.ts` (Store B wallet) | Code mort, 0 appelant live | **KEEP** documenté déprécié (fait) — ne pas supprimer sans couverture de test à remplacer d'abord |
| `lib/finance/wallet-service.ts` + `lib/booking/workflow-pipeline.ts` (Store C) | Code mort, 0 appelant live, jamais branché | **DELETE** candidat sûr (jamais utilisé, pas de risque de régression) — non fait cette passe, hors mandat "ne pas modifier aveuglément" sans confirmation explicite |
| `lib/repositories/*.ts` (5 fichiers : payment/reservation/agency/customer/wallet-repository) | Code mort, 0 appelant live, `getDb()` brut partout | **DELETE** candidat sûr |
| `lib/audit/logger.ts` | Code mort, 0 appelant live | **DELETE** candidat sûr, ou **MIGRATE** si l'intention était de centraliser l'audit (actuellement chaque action insère directement dans `audit_events`, dupliqué partout — un vrai helper centralisé serait une amélioration, pas juste un nettoyage) |
| Tables orphelines DB (`bookings`, `accommodations`, `transport_services`, `locations`, `services`, `profiles`, `inventory`) | Absentes de `lib/db/schema.ts`, 0 usage applicatif confirmé | **DELETE** candidat — à confirmer qu'aucun système externe (ancien site, script de migration en cours) n'en dépend avant de `DROP TABLE` ; a minima documenter leur statut "abandonné" |
| `extra/` (répertoire) | Signalé dans un audit antérieur (`STRESS_TEST_B2B_B2C_REPORT.md`) comme miroir obsolète de `lib/`, non scanné par `pnpm test` | **DELETE** — non ré-examiné cette passe, recommandation héritée reconduite |
| `app/pro/sandbox/page.tsx` | Page bac à sable, données mock assumées | **KEEP** (non prioritaire, pas un risque) |
| `/b2b/*` vs `/pro/(app)/*` | Duplication fonctionnelle réelle (dashboard + wallet), pas de bug de sécurité | **MIGRATE** — voir §I |
| `debitPartnerCredit`'s `DrizzleLikeTx`/`DrizzleLikeChain` (type mock-friendly manuel) | Pattern délibéré pour permettre des tests unitaires sans DB réelle | **KEEP** — fonctionne bien, vient de prouver sa valeur (a permis de repérer et corriger AUDIT-01 avec des tests précis) |

---

## H. Route Matrix

| Route | Public/Privé | Rôle requis | Guard | Protection backend | État |
|---|---|---|---|---|---|
| `/`, `/vols`, `/hotels-monde`, `/hotels/search`, `/hotels/[id]`, `/omra`, `/packages`, `/car`, `/transferts`, `/transferts/resultats` | Public | Aucun | Aucun | RLS catalogue (partiel — voir C.3) | ✅ Fonctionnel (lecture) |
| `/booking/*` | Public en apparence | **En réalité `partner_*`/`super_admin`** | `createReservationFromDraft` refuse silencieusement côté serveur | RLS tenant | ⚠️ AUDIT-02 — trompeur pour un vrai visiteur B2C |
| `/login`, `/login/select` | Public | — | — | — | Non audité en détail cette passe |
| `/pro/login`, `/pro/(app)/*` | Privé | `partner_owner`/`partner_agent`/`super_admin` (preview) | Layout uniquement (pas de middleware) | RLS tenant | ✅ Fonctionnel (lecture de code) |
| `/b2b`, `/b2b/wallet` | Privé | `partner_owner`/`partner_agent` | Layout uniquement | RLS tenant (même store que `/pro`) | ✅ Fonctionnel, dupliqué avec `/pro` |
| `/admin/*` | Privé | Staff OTA (`agency_type='ota'`) | **Middleware + layout** (2 couches) | RLS admin/tenant | ✅ Fonctionnel (lecture de code) — layout non lu cette passe |
| `/mutuelle`, `/mutuelle/login` | Privé | `mutuelle` | Layout (cookie ou DB) | Non vérifié en détail | Isolé du reste, produit distinct comme demandé |

---

## I. Recommended Architecture

- **Wallet/Paiement** : déjà cible-défini dans `WALLET_PAYMENT_AUDIT_REPORT.md` §6/§7 — Store A (`agencies.deposit_balance` + `partner_credit_movements`) canonique, `set_agency_deposit_balance()` comme seul canal d'écriture (nouveau, cette passe), Store B/C à supprimer une fois confirmé sans risque.
- **B2B** : consolider `/b2b/*` dans `/pro/(app)/*`. Plan minimal-risque : garder les 2 URLs mais faire de `/b2b` et `/b2b/wallet` de simples redirections vers `/pro` et `/pro/paiements` (préserve les liens/favoris existants sans maintenir deux implémentations) — décision produit à valider, pas fait cette passe.
- **Admin** : étendre `proxy.ts` pour couvrir `/pro` et `/b2b` avec la même défense en profondeur middleware+layout que `/admin`.
- **RLS** : traiter `currencies` (policy inerte, `GRANT` large actif) en priorité parmi les tables encore RLS-désactivées ; migrer `inventory_locks`'s cron vers `withSystemContext()` avant d'activer sa RLS (même séquence que `payment_events`) ; concevoir les policies à jointure pour `omra_flights`/`omra_room_allocations` ; resserrer `suppliers` à l'écriture super_admin-only.
- **Booking Engine** : cible déjà largement atteinte pour l'hôtel Tunisie (MyGo) — étendre le même pattern (revalidation fournisseur avant écriture, compensation sur échec) aux autres modules s'ils obtiennent un jour un vrai fournisseur externe (Omra/transferts/car sont actuellement des catalogues internes, pas de fournisseur tiers à revalider).
- **CRM** : confirmé absent (aucune table `leads`, aucun code de scoring) — hors périmètre de cet audit, à traiter comme un vrai chantier produit si demandé.
- **Authentication** : consolider `getCurrentAdminProfile`/`getCurrentPartnerProfile` — les deux font un bootstrap RLS identique (`resolve_session_context()`) avec des noms/formes de retour différents pour un besoin très proche ; un seul point d'entrée réduirait le risque de divergence future (le genre de divergence qui a causé AUDIT-10).

---

## J. Action Plan

**Phase 1 — Critical Security** *(cette passe)*
- [x] AUDIT-01 : fonction `set_agency_deposit_balance()`, migration de `debitPartnerCredit`/`creditRechargeRequest`/`adminRechargeWallet` — **FAIT**
- [ ] AUDIT-03 : resserrer RLS `suppliers` à l'écriture super_admin-only (après confirmation des besoins de lecture)
- [ ] Vérifier `app/admin/layout.tsx` (non lu cette passe) pour confirmer qu'il réplique bien `isAllowedIntoAdmin()` en defense-in-depth comme documenté

**Phase 2 — Booking Reliability**
- [ ] Test de concurrence réel (2 réservations simultanées, même solde) contre un environnement avec DB — BLOCKED dans ce sandbox
- [ ] Vérifier cache/retry/pagination du moteur de recherche hôtel (non couvert cette passe)

**Phase 3 — Wallet/Payments**
- [ ] Items déjà listés dans `WALLET_PAYMENT_AUDIT_REPORT.md` §15 (checkout B2C, initiation paiement en ligne réelle, PDF facture)

**Phase 4 — Hotel Engine**
- [ ] RAS — déjà solide, pas d'action critique identifiée cette passe

**Phase 5 — B2B**
- [ ] Décision produit : consolider `/b2b` → `/pro` (redirections) ou les maintenir séparés délibérément
- [ ] Étendre `proxy.ts` à `/pro`/`/b2b` (défense en profondeur middleware)

**Phase 6 — UX/UI**
- [ ] RAS pour homepage/moteur de recherche (fait cette session) — reste du produit non demandé, non touché

**Phase 7 — Cleanup**
- [ ] Supprimer Store C (`lib/finance/wallet-service.ts`, `lib/booking/workflow-pipeline.ts`), `lib/repositories/*.ts`, `lib/audit/logger.ts` (candidats DELETE sûrs, confirmés 0 appelant live)
- [ ] Nettoyer `extra/` (recommandation héritée, non ré-examinée)
- [ ] `DROP` ou documenter formellement les tables orphelines template

**Phase 8 — Production Hardening**
- [ ] RLS restantes (`omra_*` catalogue, `inventory_locks`, `yield_rules`, `currencies`, `products`, `audit_logs`)
- [ ] Créer les 3 comptes de test (voir ci-dessous) pour la phase 2 (environnement authentifié)

---

## Phase 2 — Ce qu'il faut pour l'environnement de test authentifié

Comme demandé, **aucune clé `service_role` n'a été demandée**, **aucune donnée `auth.users` n'a été touchée** directement en SQL. Pour débloquer les scénarios marqués BLOCKED dans ce rapport, créer via **Supabase Dashboard → Authentication → Users → Add user** (ou l'API Admin depuis un environnement serveur sécurisé — jamais depuis ce sandbox) :

| Compte | Rôle applicatif (table `users`) | `agency_type` de son agence | Usage |
|---|---|---|---|
| Compte 1 | `partner_owner` | `partner` | Valider `/pro` complet + `/b2b`, isolation cross-agence (avec Compte 4 ci-dessous) |
| Compte 2 | `partner_agent` | `partner` (même agence que Compte 1) | Valider les restrictions agent vs owner |
| Compte 3 | `manager` ou `super_admin` | `ota` | Valider `/admin/*`, RBAC, preview `/pro` en tant que super_admin |
| Compte 4 (isolation) | `partner_owner` | `partner` (**agence différente** de Compte 1/2) | Prouver qu'un partenaire ne voit jamais les données d'un autre (réservations, wallet, factures) |

Après création dans Supabase Auth, il faut ensuite lier chaque `auth.users.id` à une ligne `public.users` (avec `agency_id`, `role`, `status='active'`) et à une ligne `public.agencies` (avec `agency_type` approprié) — via les Server Actions existantes ou un script de provisioning explicite, jamais par insertion SQL arbitraire dans `auth.users`.

---

## Conclusion

Le trou RLS trouvé et corrigé cette passe (AUDIT-01) était plus sévère que tout ce que l'audit wallet précédent avait identifié : il rendait le système de débit B2B **fonctionnellement inopérant en silence** malgré une architecture par ailleurs correcte (verrouillage, idempotence, ledger). Sa correction restaure la fonctionnalité réelle du seul flux de réservation qui fonctionne aujourd'hui (B2B via `/pro`).

Le verdict global reste néanmoins **NOT READY** pour une mise en production complète B2C+B2B+Admin, pour la même raison structurelle déjà identifiée : **le B2C n'existe pas comme flux autonome**. Le B2B, lui, est maintenant significativement plus solide qu'avant cette session.
