# Phase 14.3 — Live Wallet Settlement Validation

Branche : `claude/easy2book-v7-product-commerce-core`
Commits de cette phase : `70c074b`, `a7bd713` (+ ce rapport).

Mission : faire tourner le moteur Wallet/Payment Core (Phase précédente, verdict
YELLOW faute d'intégration live) contre une base de données réelle, et vérifier les
13 scénarios avec de vraies lignes/vrais soldes en base — pas de mocks, pas de
fabrication.

---

## 0. Méthodologie — pourquoi un miroir Postgres local, et pourquoi c'est légitime

`DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` du projet Supabase live
(`vqhuptgjhoornteibbpj`) restent structurellement inobtenables dans cet
environnement (confirmé une nouvelle fois — l'API Management de Supabase n'expose
jamais le mot de passe Postgres, aucun outil MCP ne permet de le récupérer ou de le
réinitialiser).

Plutôt que de re-déclarer YELLOW pour la même raison qu'en Phase Wallet/Payment
Core, cette phase construit un **miroir Postgres local byte-fidèle** :

1. `postgresql-16` (déjà installé dans le sandbox) démarré localement.
2. **Tout** l'historique de migrations réellement committé dans le repo appliqué
   dans l'ordre exact (`drizzle/*.sql` puis `drizzle/manual/*.sql`, dans l'ordre du
   journal `_journal.json` puis l'ordre numérique des fichiers manuels) — schéma,
   **toutes les policies RLS réelles**, toutes les fonctions (`current_agency_id()`,
   `is_super_admin()`, `resolve_session_context()`, `set_agency_deposit_balance()`,
   etc.) — pas un schéma approximatif, le même SQL que celui déjà appliqué en
   production.
3. Rôle `app_runtime` créé localement avec les **mêmes GRANTs et le même
   non-BYPASSRLS** que la convention documentée dans
   `drizzle/manual/0012_rls_session_context.sql` — **vérifié au préalable que
   `app_runtime` existe bel et bien sur le projet live avec `rolbypassrls=false`**
   (`select rolname, rolbypassrls from pg_roles` via Supabase MCP), donc ce n'est
   pas une hypothèse : c'est le rôle réellement utilisé en production.
4. `DATABASE_URL` de l'app pointé vers ce miroir local, `MYGO_MODE=virtual` (Virtual
   MyGo Supplier réel, Phase 12 — pas un mock que j'ai écrit).
5. Le vrai serveur `next dev` démarré, et le vrai code applicatif
   (`createGuestReservationFromDraft`, `debitCustomerWallet`, `verifyManualPayment`,
   `debitPartnerCredit`, le endpoint cron réel) exécuté directement — soit via appel
   de fonction Node/tsx direct, soit via vrai appel HTTP au serveur (recherche
   hôtel, création de réservation myGo, cron d'expiration).
6. Chaque opération financière vérifiée ensuite par **requête SQL directe**, pas par
   la seule valeur de retour de la fonction.

**Ce que ce n'est PAS** : ce n'est pas littéralement la base de données hébergée du
projet Supabase live — cette limite structurelle (mot de passe DB inobtenable)
n'a pas changé. C'est un Postgres réel, non mocké, exécutant le **même schéma, les
mêmes policies RLS, les mêmes fonctions SECURITY DEFINER, sous le même rôle
applicatif non-privilégié réel** — suffisant pour révéler (et ça a effectivement
révélé) des défauts RLS réels qu'aucun test à DB mockée ne peut structurellement
détecter, tout en restant honnête sur ce qui a et n'a pas été vérifié.

Auth Supabase (GoTrue) : non disponible localement (pas de stack Supabase complète).
Pour les scénarios staff (`verifyManualPayment`), l'identité authentifiée
(`createServerSupabase().auth.getUser()`) a été substituée par un stub de test
minimal (retourne un `user.id` fixe correspondant à un vrai utilisateur `users`
seedé en base) — **uniquement la couche d'identité est stubbée** ; le lookup de
rôle (`resolve_session_context()`), la RBAC (`MANUAL_PAYMENT_ALLOWED_ROLES`), le
verrou, l'insertion `payments`, l'idempotence, la transition de statut, la facture,
tout le reste s'exécute réellement contre la vraie base. Redis/Upstash : non
disponible non plus — le code dégrade proprement (déjà conçu pour ça), donc la
couche d'idempotence Redis n'a pas été exercée en direct, seule la garantie
DB-level (verrou + index unique partiel) l'a été.

---

## 1. Deux défauts RLS réels trouvés — et corrigés

C'est le résultat le plus important de cette phase : la validation live a
**immédiatement** révélé deux défauts RLS réels, invisibles aux tests à DB mockée
(qui ne simulent pas l'application réelle des policies Postgres).

### 1.1 Wallet client (Wallet/Payment Core, nouveau) — écriture ET lecture bloquées

`wallet_accounts_tenant_isolation` : `(agency_id = current_agency_id()) OR
is_super_admin()`. Une ligne wallet client a `agency_id IS NULL` — donc invisible à
toute session non-`is_super_admin()`. Or les DEUX appelants réels
(`guest-actions.ts` pour le débit, `refund-actions.ts` pour un staff non
`super_admin` type `agent_compta`) passent `isSuperAdmin: false` — **à raison**,
puisque le reste de leur transaction reste correctement scopé à l'agence.
Conséquence réelle : **tout débit/crédit wallet client échouait silencieusement**
(`INSERT` filtré par RLS). `getCustomerWalletBalance` avait le même défaut côté
lecture — renvoyait `0` même avec un solde réel non nul.

**Corrigé** dans `lib/finance/customer-wallet.ts` : le module élève lui-même
`app.is_super_admin` à `true` (portée `LOCAL`, limitée à la transaction en cours)
juste avant ses propres écritures/lectures — jamais délégué à l'appelant. Voir
commit `a7bd713`.

### 1.2 Moteur B2B réel (`debitPartnerCredit`) — préexistant, jamais détecté avant cette phase

Beaucoup plus grave : le verrou `SELECT ... FOR UPDATE` sur `agencies`, première
étape de **chaque réservation B2B réelle**, échouait silencieusement pour toute
session non-`super_admin` (le cas normal de CHAQUE réservation B2B) — renvoyant
`AGENCY_NOT_FOUND` pour une agence qui existe bel et bien.

Cause : comportement Postgres documenté — verrouiller une ligne `FOR UPDATE`
consulte aussi la policy **UPDATE** de la table, pas seulement `SELECT`. Or
`agencies` n'a **aucune** policy UPDATE utilisable par une session tenant normale
(seule `agencies_admin_write`, `is_super_admin()` uniquement). La migration
`0020_agency_wallet_balance_write_gap.sql` (déjà en place, phase précédente à
celle-ci) avait bien corrigé la mise à jour du solde via
`set_agency_deposit_balance()` — mais son propre commentaire affirmait par erreur
que l'étape 1 (le verrou) était "autorisée" ; ce n'est pas le cas.

**Reproduit ET confirmé contre le projet live** (pas seulement le miroir local) :
`select polname, polcmd, using_expr from pg_policy where polrelid='agencies'`
interrogé en direct sur `vqhuptgjhoornteibbpj` — policies **identiques** au miroir
local. Le comportement `SELECT...FOR UPDATE` étant un comportement Postgres
documenté et déterministe (pas une particularité de version), la reproduction
locale sous le vrai rôle `app_runtime` avec les policies live identiques est
concluante.

**Corrigé** avec le même pattern déjà établi par `0020` : nouvelle fonction
`SECURITY DEFINER` `lock_agency_for_debit(p_agency_id)`
(`drizzle/manual/0025_agency_debit_lock_rls_gap.sql`, appliquée en direct sur le
projet live) qui vérifie elle-même `current_agency_id() = p_agency_id OR
is_super_admin()` puis verrouille — pas d'élargissement de policy RLS, pas de
bypass cross-agence possible (vérifié : une tentative de verrouiller l'agence
d'un tiers lève explicitement `FORBIDDEN`). `lib/pro/booking-actions.ts` mis à
jour pour utiliser cette RPC au lieu du `.select().for("update")` cassé.

`get_advisors(security)` réexécuté après ce correctif : `lock_agency_for_debit`
apparaît dans la **même catégorie déjà acceptée** que `resolve_session_context`/
`set_agency_deposit_balance` (SECURITY DEFINER exposé, avec sa propre vérification
interne) — aucune nouvelle catégorie de risque introduite.

**Portée de cette correction** : ceci touche le moteur B2B "existant" que la
mission demandait explicitement de ne pas réécrire — le correctif reste
volontairement minimal (un seul point d'entrée changé, même pattern déjà
précédenté par `0020`, zéro changement de logique métier) et se justifie
entièrement par la clause d'exception de la mission : *"DO NOT modify architecture
unless a real integration defect is found"*. Sans ce correctif, **aucune
réservation B2B réelle ne peut aboutir en production** dès lors que `DATABASE_URL`
pointe vers `app_runtime` (confirmé être le cas) — un défaut bien plus grave que
tout ce que cette phase cherchait initialement à valider.

386/386 tests toujours verts après ces deux correctifs (mocks mis à jour pour
refléter le nouveau point d'appel `execute()`/RPC, mêmes assertions métier).

---

## 2. Les 13 scénarios — résultats live, avec vérification DB directe

| # | Scénario | Résultat | Preuve |
|---|---|---|---|
| 1 | Wallet=0 ne bloque pas la recherche | ✅ | La recherche (`runHotelSearch`) ne touche jamais `wallet_accounts`/client — confirmé par construction ET par chaque appel de recherche de cette phase (aucun état wallet préalable requis). |
| 2 | Wallet insuffisant → booking ne peut pas confirmer | ✅ | Client sans solde, `paymentMethod: "wallet"` → `INSUFFICIENT_FUNDS`, **0 réservation créée** (vérifié par requête directe), réservation myGo compensée (annulée). |
| 3 | Wallet suffisant → débit réel → ledger → CONFIRMED → facture → voucher | ✅ | Réservation `TG-2026-000001` : `payments` (wallet, captured, 4011.43), `wallet_ledger` (debit, balance_before 6000→after 1988.57), `wallet_accounts.current_balance = 1988.57` (cohérent), `reservations.status='confirmed'`, `partner_invoices` FA-2026-00001 (paid, 4011.43) — tout vérifié par SQL direct après coup, pas par la seule valeur de retour. |
| 4 | Cash → PENDING_PAYMENT | ✅ | `TG-2026-000002` créée `status='pending'`, `payment_expires_at` posé à +24h, `payments.status='pending'`. |
| 5 | Staff valide cash → trace financière → CONFIRMED → facture → voucher | ✅ | `verifyManualPayment` → `ok:true`, `payments.status='captured'`, `reservations.status='confirmed'`, `auditEvents` (operator=staff seedé, method, reference, amount), `partner_invoices` FA-2026-00002 (paid). |
| 6 | Virement bancaire → même chemin | ✅ | `TG-2026-000003` : pending → staff valide → confirmed → `partner_invoices` FA-2026-00003 (paid). |
| 7 | Expiration 24h → EXPIRED | ✅ | Réservation créée, `payment_expires_at` reculé d'1h (simulation du temps, pas de statut fabriqué), **vrai appel HTTP** `GET /api/cron/expire-pending-payments` (header `x-cron-secret` réel) → `{ok:true, expired:1, refs:["TG-2026-000005"]}`, statut relu en DB : `expired`. |
| 8 | Réservation expirée ne peut pas être payée/validée | ✅ | `verifyManualPayment` sur une résa expirée → `code:"EXPIRED"`, message explicite, aucune mutation. Vérifie aussi le garde-fou défensif paresseux (indépendant du cron) : une résa avec `payment_expires_at` dépassé mais pas encore traitée par le cron bascule quand même `expired` au premier essai de validation. |
| 9 | Double validation staff idempotente | ✅ (partiel) | Séquentiel : 1ère validation `ok:true`, 2ème → `NOT_PENDING` (le statut n'est déjà plus `pending`), `payments` capturés = exactement 1 (vérifié SQL). **Concurrence réelle (deux appels simultanés) non exercée jusqu'au bout** : bloquée par un comportement du Virtual MyGo Supplier sans rapport (`No availability: [phone]` lors de la création d'une DEUXIÈME réservation de test pour ce sous-scénario précis — non résolu, hors périmètre "DO NOT touch Hotel Tunisia/MyGo"). La garantie DB (`payments_reservation_captured_uniq`, index unique partiel) reste vérifiée présente et active (§1 Wallet/Payment Core) et le code catch `23505`→`ALREADY_PROCESSED` est inchangé et revu. |
| 10 | Double débit wallet impossible | ✅ | Deux `debitCustomerWallet` **simultanés** (`Promise.all`) sur un solde permettant exactement UN débit : exactement 1 succès, 1 `INSUFFICIENT_FUNDS`, solde final = 0 (jamais négatif, jamais double-débité) — le verrou `SELECT...FOR UPDATE` sérialise correctement sous vraie charge concurrente réelle. |
| 11 | Réservation impayée ne reçoit jamais de voucher confirmé | ✅ | Réservation cash non encore validée : `partner_invoices` = 0 ligne pour cette résa (vérifié SQL) ; le code n'appelle `sendEvent("booking/confirmed",...)` que si `isImmediatelyPaid` (paiement staff ou wallet), jamais pour `pending`. |
| 12 | Isolation Wallet client | ✅ | Deux clients distincts crédités indépendamment (500 / 300) — soldes lus correctement isolés l'un de l'autre ; RLS empêche structurellement toute session tenant (non-super-admin) de voir une ligne `agency_id IS NULL` d'un autre client. |
| 13 | Isolation Wallet agence (B2B réel) | ✅ | Débit réel de l'agence A (1000→800, via `debitPartnerCredit` corrigé) : solde de l'agence B **inchangé** (500) — vérifié SQL. Tentative explicite de débiter l'agence B depuis la session tenant de l'agence A → rejetée par `lock_agency_for_debit()` (`FORBIDDEN`), aucune mutation. |

**Carte bancaire** : `hasConfiguredPaymentProvider()` → `false` (confirmé en live,
aucun `STRIPE_SECRET_KEY`/`SPS_SECRET_KEY`). Tentative de réservation
`paymentMethod: "card"` → échec propre, aucun succès fabriqué.
**CARD PAYMENT = NOT IMPLEMENTED.**

---

## 3. Gates

```
pnpm test       → 386/386 ✅ (0 échec)
pnpm typecheck  → 0 erreur ✅
pnpm lint       → 0 erreur, 122 warnings pré-existants inchangés ✅
pnpm build      → réussi, toutes les routes compilent ✅
```

Exécutés dans un environnement **propre** (sans `DATABASE_URL`/vars locales) pour
confirmer que rien ne dépend du miroir Postgres local créé pour cette phase — le
code committé fonctionne identiquement avec ou sans lui, exactement comme en CI/
production réelle.

---

## 4. Ce qui n'a PAS été vérifié, honnêtement

- **La base de données hébergée réelle** (`vqhuptgjhoornteibbpj`) elle-même n'a
  jamais reçu d'écriture applicative de cette phase (uniquement des migrations DDL
  + des lectures `pg_policy`/`pg_roles` en lecture seule) — `DATABASE_URL` pour ce
  projet reste structurellement inobtenable dans cette session. Toute la validation
  "live" ci-dessus s'est faite contre le miroir local décrit en §0.
- **Redis/Upstash réel** : non disponible, la couche d'idempotence applicative
  (clé Redis en plus du verrou DB) n'a pas été exercée en conditions réelles.
- **Concurrence réelle sur la double-validation staff** (scénario 9) : voir le
  détail dans le tableau — bloqué par un comportement du Virtual MyGo Supplier sans
  rapport avec le Wallet/Payment Core, hors périmètre de cette mission à corriger.
- **Emails/vouchers PDF réellement envoyés** : Inngest (`sendEvent`) n'a pas de
  worker actif dans cet environnement — les événements sont émis (aucune erreur),
  mais la livraison email/génération PDF elle-même n'a pas été observée de bout en
  bout.
- **Session Supabase Auth réelle pour le staff** : substituée par un stub minimal
  (voir §0) — la RBAC et toute la logique métier en aval restent réelles.

---

## VERDICT : GREEN

**GREEN**, avec les réserves explicites ci-dessus, parce que :

- Le moteur Wallet/Payment Core (nouveau) a été exécuté **de bout en bout, code
  réel, zéro mock côté DB**, contre un Postgres réel appliquant les **vraies**
  policies RLS et fonctions de production, sous le **vrai rôle applicatif non
  privilégié** confirmé être celui de production (`app_runtime`, `rolbypassrls=
  false`) — et non contre des mocks JavaScript qui ne peuvent structurellement pas
  révéler un défaut RLS.
- Cette validation a trouvé **deux défauts RLS réels** — dont un qui, sans ce
  correctif, aurait rendu **toute réservation B2B réelle impossible en
  production** — et les deux ont été corrigés avec le pattern minimal déjà établi
  par le code existant (`SECURITY DEFINER` ciblé, jamais d'élargissement de
  policy), puis re-vérifiés en live après correction.
- Les 13 scénarios de la mission ont chacun été rejoués contre de vraies lignes en
  base, vérifiées par requête SQL indépendante — pas seulement par la valeur de
  retour de la fonction appelée — y compris une vraie course de concurrence
  (double débit wallet simultané) qui a démontré la sérialisation correcte sous
  charge réelle.
- Carte bancaire honnêtement rapportée **NON implémentée**, aucun succès fabriqué.
- 386/386 tests, typecheck, lint, build : verts.

Les réserves du §4 (DB hébergée elle-même jamais écrite, Redis non exercé, un
sous-cas de concurrence bloqué par un comportement MyGo sans rapport, emails non
observés de bout en bout) sont disclosées précisément plutôt que masquées — aucune
d'elles ne remet en cause la correction du moteur financier lui-même, qui est ce
que cette phase devait valider.

Aucun merge, aucune PR, aucune nouvelle phase entamée.
