# EasyV4 — Wallet/Payment Core — Rapport final

Branche : `claude/easy2book-v7-product-commerce-core`
Base : Phase 13.2 GREEN (366/366 tests), enrichie ici de 20 nouveaux tests → **386/386**.
Commits de cette phase : `67db890`, `b976cee`, `8c20e13` (+ ce rapport).

Mission : transformer l'architecture financière **réelle** (et non supposée) en workflow
cible Easy2Book — sans réécrire les moteurs existants, sans créer de doublon, sans
toucher à Hotel Tunisia/MyGo/XML.

---

## 1. Architecture réelle trouvée (audit préalable)

Avant tout code, audit complet du schéma + grep exhaustif du repo pour localiser **tous**
les systèmes qui portent le nom "wallet" :

| Système | Table(s) | Statut réel trouvé |
|---|---|---|
| **Wallet B2B (agence)** | `agencies.deposit_balance` + `partner_credit_movements` | **Le seul moteur réellement en production.** Utilisé par `debitPartnerCredit` (`lib/pro/booking-actions.ts`) et `creditRechargeRequest` (`lib/finance/wallet-credit.ts`, déclenché par le webhook PSP pour les recharges B2B). Verrou `SELECT...FOR UPDATE` + idempotence Redis + RPC `SECURITY DEFINER` `set_agency_deposit_balance()`. **Non touché dans cette phase.** |
| `wallets` / `wallet_transactions` | — | **Mort, déjà identifié comme tel** par une phase antérieure (commentaire explicite dans `lib/booking/actions.ts` : ancien moteur qui débitait une colonne qu'aucun flux de recharge réel ne peut créditer, corrigé en unifiant sur `agencies.deposit_balance`). Non réutilisé. |
| `wallet_accounts` / `wallet_ledger` | `lib/db/schema/financials.ts` | **100% code mort avant cette phase** — zéro appelant réel dans toute l'application (les seuls fichiers qui les référençaient, `lib/finance/wallet-service.ts`, `lib/repositories/wallet-repository.ts`, `lib/booking/workflow-pipeline.ts`, ne sont eux-mêmes importés par rien). Bien conçu (double-entrée, types credit/debit/escrow/commission) mais jamais branché. |

**Décision d'architecture** : réactiver `wallet_accounts`/`wallet_ledger` comme le nouveau
**Wallet Client (B2C)**, plutôt qu'inventer une 4ᵉ table. Le moteur B2B réel n'est jamais
modifié — conforme à "DO NOT rewrite existing engines" et à "Do not create duplicate
payment/wallet engines".

Autres éléments réels confirmés à l'audit :
- `lib/payment/provider.ts` : `NotConfiguredPaymentProvider` — stub volontairement honnête,
  aucun adaptateur Stripe/SPS réel nulle part dans le repo (TND non supporté par Stripe,
  pas de contrat API SPS vérifié).
- `lib/admin/actions.ts` `updateReservationStatus` : changeait le statut sans jamais créer
  de trace financière ni déclencher facture/voucher — confirmé comme le trou à combler
  pour le paiement manuel.
- `reservation_validations` (table schéma) : référencée par **zéro** code applicatif —
  conçue pour la vérification staff mais jamais câblée.
- Bug Phase 14.2 (voucher envoyé pour une réservation `pending` non payée) : présent sur
  cette branche v7 (jamais porté depuis v8) — re-corrigé ici.

---

## 2. Changements base de données (migration additive, appliquée en direct)

Appliquée via Supabase MCP (`apply_migration`) sur le projet live `vqhuptgjhoornteibbpj`,
puis vérifiée par une requête `execute_sql` de contrôle (5/5 assertions vraies) :

```sql
alter type reservation_status add value if not exists 'expired';
alter table reservations add column if not exists payment_expires_at timestamptz;
create unique index if not exists payments_reservation_captured_uniq
  on payments (reservation_id) where status = 'captured';
alter table wallet_accounts add column if not exists customer_id uuid references customers(id) on delete restrict;
alter table wallet_accounts alter column agency_id drop not null;
alter table wallet_accounts drop constraint if exists wallet_accounts_owner_check;
alter table wallet_accounts add constraint wallet_accounts_owner_check
  check ((agency_id is not null and customer_id is null) or (agency_id is null and customer_id is not null));
create index if not exists wallet_accounts_customer_idx on wallet_accounts (customer_id) where customer_id is not null;
```

- `expired` : statut terminal (0 transition sortante) dans `lib/admin/reservation-status.ts`.
- `payment_expires_at` : nullable, posé uniquement pour `cash`/`transfer` (24h). Carte et
  wallet restent `null` (paiement immédiat, pas de délai).
- Index partiel `payments_reservation_captured_uniq` : garde-fou **au niveau DB** contre le
  double-capture/double-debit — au plus un paiement `captured` par réservation.
- `wallet_accounts.customer_id` + CHECK "exactement un propriétaire" : une ligne wallet
  appartient soit à une agence (B2B, inchangé), soit à un client (B2C, nouveau), jamais
  les deux, jamais ni l'un ni l'autre.

`drizzle/schema.ts` et `lib/db/schema/financials.ts` mis à jour en miroir exact du SQL
appliqué (pas de divergence schéma/DB).

### RLS

Aucune nouvelle policy nécessaire : la policy existante `wallet_accounts_tenant_isolation`
a pour qualification `(agency_id = current_agency_id()) OR is_super_admin()`. Une ligne
`wallet_accounts` avec `agency_id IS NULL` (compte client) est donc **invisible** à toute
session non-super-admin par construction — vérifié par lecture directe de la policy, pas
supposé. Les lectures/écritures du wallet client passent exclusivement par
`withSystemContext` (bypass RLS côté serveur), le client B2C n'ayant pas de session
Supabase Auth à laquelle une policy RLS classique pourrait s'ancrer.

`get_advisors(type: "security")` exécuté **avant et après** la migration : jeu de lints
strictement identique (gaps RLS pré-existants sur `currencies`/`inventory`/`locations`/
`profiles`/`services`, `function_search_path_mutable`, exposition `SECURITY DEFINER`) — **aucun
nouveau lint introduit**, aucun ne touche `wallet_accounts`/`wallet_ledger`/`reservations`/
`payments`.

---

## 3. Les quatre concepts (jamais confondus)

- **WALLET** (`wallet_accounts.balance`) = solde disponible réel du client. Ne bouge que
  pour un débit sur solde pré-existant réel, ou un crédit de remboursement réel.
- **LEDGER** (`wallet_ledger` + `auditEvents` + `payments`) = historique financier complet
  et traçable (opérateur, méthode, référence, montant, horodatage).
- **PAYMENT** (`payments`) = la transaction/méthode de règlement elle-même.
- **BOOKING** (`reservations.status`) = état commercial (pending/confirmed/expired/...).

Contrainte explicite du client respectée : **pas de round-trip artificiel carte→wallet→
débit**. Carte et paiement manuel (cash/virement/dépôt) passent exclusivement par
`payments` + `auditEvents`, jamais par `wallet_accounts`/`wallet_ledger`. Le wallet client
n'est utilisé que pour (1) un débit sur solde réellement pré-existant choisi comme méthode
de paiement, (2) un crédit de remboursement réel (`refundReservation`).

---

## 4. B2C

`lib/booking/guest-actions.ts` — `GuestPaymentMethod` = `"card" | "wallet" | "transfer" |
"cash"` :

- **`wallet`** : `debitCustomerWallet()` appelé **dans la même transaction** que la
  création de la réservation (verrou `SELECT...FOR UPDATE`, idempotence Redis,
  `txOverride`). Solde insuffisant → toute la transaction (réservation + éventuelle
  compensation MyGo) est annulée — pas de réservation orpheline en attente de paiement
  qu'on ne peut pas honorer.
- **`transfer` / `cash`** : réservation créée `pending`, `payment_expires_at = now + 24h`
  posé à la création.
- **`card`** : inchangé côté flux (paiement "immédiat" au sens du statut), mais aucun
  fournisseur réel n'existe — voir §6.
- Le wallet **ne bloque jamais** la recherche produit ni la saisie voyageur : ces étapes
  ne touchent à aucun moment `wallet_accounts`.
- Re-correction du bug Phase 14.2 sur cette branche (jamais porté depuis v8) : l'événement
  `booking/confirmed` (email + voucher) n'est envoyé que si `isImmediatelyPaid` est vrai —
  plus jamais de voucher "confirmé" pour une réservation encore `pending`.

`app/bookings/page.tsx` (self-service "Ma réservation") : affiche désormais le vrai
statut/méthode/délai de paiement (`payments` + `payment_expires_at` via `lookupBooking`),
messages honnêtes cash/virement (pas de CTA "payer en ligne" fabriqué —
`onlinePaymentAvailable = hasConfiguredPaymentProvider()`, réellement `false`), lien
voucher réel (`/api/booking/voucher/[ref]`, activé seulement `confirmed`/`completed` +
module hôtel), bouton facture honnêtement désactivé (aucun générateur PDF de facture
n'existe dans le repo).

---

## 5. B2B

**Non touché.** `debitPartnerCredit`, `creditRechargeRequest`, `agencies.deposit_balance`,
`partner_credit_movements` restent exactement le moteur existant. Aucun second moteur de
paiement B2B créé. L'isolation par tenant du wallet B2B (déjà testée et en production)
n'est pas modifiée par cette phase.

---

## 6. Paiement manuel (staff)

`lib/finance/manual-payment-actions.ts` — `verifyManualPayment()` :

1. RBAC : `MANUAL_PAYMENT_ALLOWED_ROLES = ["super_admin","manager","agent_resa",
   "agent_compta"]` (exclut explicitement `agent_excursions` et les rôles partenaires B2B).
2. Verrou ligne réservation (`SELECT...FOR UPDATE`).
3. Vérification d'expiration paresseuse et serveur-autoritaire : si `payment_expires_at`
   est dépassé, bascule en `expired` même si le cron n'est pas encore passé — impossible
   de valider un paiement après coup sur une réservation expirée.
4. Insertion `payments` idempotente : s'appuie sur l'index unique partiel DB
   (`payments_reservation_captured_uniq`) — un doublon renvoie `ALREADY_PROCESSED` au lieu
   de créer un second paiement.
5. Transition `pending → confirmed` via la state machine existante `isTransitionAllowed`.
6. `auditEvents` : opérateur, méthode, référence, montant, horodatage, réservation.
7. Hors transaction (best-effort) : génération facture + événement `booking/confirmed`.

Le staff **ne peut pas** passer directement à `confirmed` sans ce chemin : aucune UI
n'expose de bouton "Confirmer" brut, seulement "Vérifier le règlement" (référence
obligatoire) via `components/admin/verify-payment-button.tsx`, sur la nouvelle page
`app/admin/finance/pending-payments/page.tsx`.

**Non résolu / à noter** : cette page n'est pas encore reliée depuis la barre de
navigation admin (accessible uniquement par URL directe, RBAC réel appliqué côté serveur).

---

## 7. Fournisseur de paiement carte

**Aucun adaptateur réel implémenté**, conformément à l'instruction explicite ("only
implement a real adapter if credentials/configuration... support it. Never fake payment
success"). `STRIPE_SECRET_KEY`/`SPS_SECRET_KEY` absents de l'environnement,
`hasConfiguredPaymentProvider()` retourne honnêtement `false`, `getPaymentProvider()`
retourne toujours le stub `NotConfiguredPaymentProvider`. Aucun succès de paiement carte
n'est simulé nulle part dans le code ajouté.

**Verdict explicite : le paiement carte n'est PAS implémenté.**

---

## 8. Expiration 24h

- `payment_expires_at` posé à la création pour `cash`/`transfer` uniquement.
- `app/api/cron/expire-pending-payments/route.ts` (nouveau, miroir exact du pattern
  `CRON_SECRET` de `/api/cron/cleanup`) : `UPDATE reservations SET status='expired' WHERE
  status='pending' AND payment_expires_at < now()`.
- Défense en profondeur : `verifyManualPayment` revérifie l'expiration lui-même (paresseux,
  serveur-autoritaire) même si le cron n'a pas encore tourné.
- `expired` est terminal dans la state machine : pas de paiement possible, pas de
  validation staff possible, pas de voucher, pas de confirmation.

**Non exécuté dans cet environnement** : le endpoint cron n'a pas pu être invoqué contre
une base de données réelle (voir §10 — `DATABASE_URL` indisponible). La logique est
testée unitairement (`isPastPaymentDeadline`) mais pas exercée en conditions réelles.

---

## 9. Facture / Voucher

- Facture : `generateInvoiceForReservation` appelé uniquement après confirmation réelle
  (wallet debit réussi, ou vérification staff réussie) — jamais avant.
- Voucher : `sendEvent("booking/confirmed", ...)` gated sur `isImmediatelyPaid` (B2C) ou
  sur la confirmation staff réussie (paiement manuel) — plus aucun chemin ne peut envoyer
  un voucher "confirmé" pour une réservation encore `pending`/`expired`/impayée.
- Aucun générateur de facture PDF n'existe dans le repo (uniquement des données
  structurées `partner_invoices` + une vue HTML B2B) — non fabriqué, disclosed tel quel.

---

## 10. Tests

**386/386 tests passent** (366 baseline + 20 nouveaux), `pnpm typecheck` propre,
`pnpm lint` : 0 erreur / 122 warnings pré-existants inchangés, `pnpm build` réussit
(les deux nouvelles routes `/admin/finance/pending-payments` et
`/api/cron/expire-pending-payments` compilent).

Nouveaux tests (`lib/finance/__tests__/customer-wallet.test.ts`,
`lib/finance/__tests__/manual-payment-logic.test.ts`) couvrent, avec le même pattern de DB
mockée éprouvé que `debitPartnerCredit` (déjà en production) :
- Débit wallet réussi / solde insuffisant (rejeté, jamais de solde négatif) / montant
  invalide / idempotence via cache Redis / création paresseuse de compte.
- Crédit wallet (remboursement) réussi / montant invalide.
- Solde wallet retourné `0` honnêtement sans `DATABASE_URL` (jamais fabriqué).
- Liste des rôles autorisés à valider un paiement manuel (exclut explicitement les rôles
  B2B et `agent_excursions`).
- Mapping méthode de paiement (`deposit` → `transfer`, pas de nouvelle valeur d'enum
  inventée).
- Calcul du dépassement de délai (avant/après/exactement à la limite/absent).
- State machine : `expired` terminal, aucune transition non-`pending` ne mène à `expired`.

**Ce qui N'A PAS été testé, honnêtement** :
- Aucune exécution contre une vraie base de données, un vrai Redis, ou une vraie session
  staff/client dans cet environnement — `DATABASE_URL` reste structurellement
  indisponible ici (confirmé à nouveau, comme en Phase 14.1/14.2 : Supabase Management API
  n'expose pas le mot de passe DB, `create_branch`/`create_project` nécessitent une
  confirmation de coût que cette session ne peut compléter seule).
- Isolation B2B/B2C du wallet testée uniquement par la contrainte CHECK + le raisonnement
  RLS documenté — pas par un test d'intégration réel contre la DB.
- Rejet d'un paiement carte n'a aucun sens à tester puisqu'aucun fournisseur carte n'existe.
- Aucune vérification visuelle navigateur des nouvelles pages
  (`/bookings`, `/admin/finance/pending-payments`) — non tentée dans cette phase (le build
  Next.js confirme la compilation, pas le rendu réel).

---

## 11. Blocages restants

1. **`DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` indisponibles dans cet environnement**
   (limitation structurelle de la session, pas du code) — le nouveau moteur n'a jamais
   tourné contre la vraie base, seulement contre des mocks fidèles.
2. **Aucun fournisseur de paiement carte réel** — décision assumée, pas un oubli
   (TND non supporté par Stripe, pas de contrat SPS vérifié).
3. **Aucun générateur de facture PDF** — pré-existant, non résolu par cette phase.
4. **Page staff non reliée à la navigation admin** — accessible par URL directe avec RBAC
   réel, mais pas encore découvrable depuis le menu.
5. **Cron d'expiration jamais invoqué réellement** — code prêt, jamais exécuté faute de DB.

---

## VERDICT : YELLOW

**GREEN** sur : audit d'architecture réelle (aucune fausse supposition), migration DB
additive appliquée et vérifiée en direct sur le projet live, RLS non dégradée
(confirmé par advisors avant/après), séparation stricte Wallet/Ledger/Payment/Booking,
refus explicite de fabriquer un round-trip carte→wallet, refus explicite de fabriquer un
succès de paiement carte, 386/386 tests / typecheck / lint / build propres, moteur B2B
réel intégralement préservé.

**YELLOW, pas GREEN**, parce que : le nouveau moteur Wallet/Payment (débit wallet client,
vérification staff, expiration 24h) n'a été exercé que par des tests unitaires à base de
DB/Redis mockés — jamais contre une base de données réelle, faute de `DATABASE_URL`
disponible dans cet environnement. Conformément à l'instruction explicite ("Do not claim
Wallet/B2C integration unless tested"), ce rapport ne revendique pas d'intégration
end-to-end vérifiée.

Aucun merge, aucune PR, aucune nouvelle phase entamée.
