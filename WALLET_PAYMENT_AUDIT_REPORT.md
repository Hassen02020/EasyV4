# Easy2Book — Audit & Validation du système Wallet B2B/B2C

> Généré le 2026-08-20, branche `claude/easy2book-v6-modernization-7gyb5v`,
> commits `4d83ec8`..`970c98c` (ce document), PR [#30](https://github.com/Hassen02020/EasyV4/pull/30)
> (premier lot, en revue) + commits directement poussés à la suite pour la
> continuation de l'audit.
>
> Portée réelle vs portée demandée : la mission demandait un audit et une
> correction exhaustifs sur 16 étapes couvrant B2C, B2B, webhooks PSP,
> factures, vouchers, Virtual Payment Provider, isolation, concurrence, et
> un rapport final. Ce document documente honnêtement ce qui a été
> **réellement corrigé et testé avec preuve** dans cette session, ce qui
> reste un **résidu documenté** (RLS non appliquée par prudence, PDF non
> généré faute de librairie), et ce qui est **CRITICAL et non résolu**
> (absence totale de checkout B2C autonome) — jamais présenté comme prêt
> s'il ne l'est pas.
>
> Conformément aux consignes reçues : aucun test unitaire existant n'a été
> supprimé, aucun contrat MyGo déjà validé n'a été touché, aucune
> transaction financière n'a jamais été supprimée (uniquement
> REVERSAL/ADJUSTMENT si besoin), toutes les règles critiques sont
> garanties côté serveur/DB (pas seulement en TypeScript), et l'audit a été
> phase-gated : investigation avant correction, une correction vérifiée et
> testée à la fois, un commit par correctif cohérent.

---

## Executive Summary

| # | Question | Réponse |
|---|---|---|
| 1 | Règle centrale demandée | `AVAILABLE_WALLET_BALANCE >= AUTHORITATIVE_BOOKING_TOTAL`, jamais `client_submitted_price` |
| 2 | Store wallet canonique retenu | `agencies.deposit_balance` + `partner_credit_movements` (Store A) — seul store réellement crédité par un flux live avant cet audit |
| 3 | Bug le plus critique trouvé | Le débit de réservation vérifiait un solde (`wallets.balance`) que plus aucun flux de recharge en production ne créditait — **aucune réservation payée par wallet ne pouvait jamais aboutir** |
| 4 | Bugs CRITICAL trouvés | 4 (WALLET-01 à 04) — 3 corrigés et testés, 1 **non résolu** (absence de checkout B2C autonome) |
| 5 | Bugs HIGH trouvés | 6 (WALLET-05 à 10) — tous corrigés, 3 appliqués directement en production (RLS/CHECK) |
| 6 | Bugs MEDIUM/LOW trouvés | 8 — documentés, corrigés quand sûrs et bien circonscrits, sinon signalés sans correction à l'aveugle |
| 7 | Tests | 190/190 unitaires (39 nouveaux cette session), 4 quality gates (typecheck/lint/test/build) à chaque commit, migrations appliquées en production avec pré-vérification |
| 8 | Migrations DB appliquées en production | 5 (`0015` à `0019`) via Supabase MCP contre le projet `vqhuptgjhoornteibbpj`, chacune pré-vérifiée avant application |
| 9 | Webhook PSP | Devient réellement fonctionnel (signature → idempotence event+business → matching montant/devise/référence → crédit wallet) — mais **aucune intégration Stripe/SPS réelle n'existe encore côté initiation de paiement** |
| 10 | Virtual Payment Provider | Construit (9 scénarios × 2 PSP, 25 tests), mais limité au côté entrant (webhook) — il n'existe rien côté sortant à virtualiser (aucun appel PaymentIntent/session SPS dans le code) |
| 11 | Checkout B2C | **N'existe pas fonctionnellement** — `createReservationFromDraft` exige un profil partenaire B2B (`partner_owner`/`partner_agent`) ou `super_admin` ; un visiteur anonyme échoue à `Non authentifié` |
| 12 | Concurrence | Verrouillage `SELECT ... FOR UPDATE` vérifié par lecture de code sur tous les chemins d'argent ; **aucun test de concurrence réel exécuté** (pas de `DATABASE_URL` dans ce sandbox) |
| 13 | Isolation B2B/B2C | Mécanisme RLS (`current_agency_id() OR is_super_admin()`) déjà prouvé en production sur d'autres tables (rapport de stress-test antérieur, 6/6 PASS) ; appliqué aux 3 nouvelles tables trouvées non protégées ; **non re-testé en live cette session** (rôle `app_runtime` non accessible depuis cet environnement — voir §9) |
| 14 | Verdict final | 🔴 **NOT READY** — voir §16 |

---

## 1. Portée auditée

Flux tracés de bout en bout : `client → checkout → payment → wallet → booking → debit → voucher → invoice → email/notification → ledger → audit`, pour les 3 modules de réservation live (Hôtel, Omra, Transfert) et les 2 chemins de recharge wallet (validation admin manuelle, webhook PSP).

Fichiers lus intégralement avant toute modification (conformément à "ne suppose rien, trace réellement les flux existants") : `lib/wallet/actions.ts`, `lib/finance/recharge-actions.ts`, `lib/pro/booking-actions.ts`, `lib/booking/actions.ts`, `lib/omra/booking-actions.ts`, `lib/transfers/actions.ts`, `lib/admin/agencies-actions.ts`, `app/api/payment/webhook/route.ts`, `lib/inngest/client.ts` + les 5 fonctions Inngest, `lib/finance/invoice-generator.ts`, `components/pro/invoices-table.tsx`, `app/pro/(app)/factures/page.tsx`, `lib/booking/workflow-pipeline.ts`, `STRESS_TEST_B2B_B2C_REPORT.md` (audit antérieur sur la même base), schéma DB complet des tables wallet/paiement/facture.

---

## 2. Findings — CRITICAL

### WALLET-01 — Le débit de réservation vérifiait un solde jamais crédité en production
- **Composant affecté** : `lib/booking/actions.ts`, `lib/omra/booking-actions.ts`, `lib/transfers/actions.ts` (avant fix, via `lib/wallet/actions.ts::walletDebitReservation`)
- **Root cause** : trois stores wallet parallèles coexistaient. `walletDebitReservation` débitait `wallets.balance`. Le seul flux de recharge réellement câblé et testé en production (`validateRechargeRequest`, approbation admin d'une demande B2B) crédite `agencies.deposit_balance`, une colonne différente.
- **Reproduction** : lecture de code — `grep -rn "wallets.balance\|deposit_balance"` sur les 3 chemins de réservation live + les 2 chemins de recharge live confirme l'absence totale de recouvrement entre le solde débité et le solde crédité.
- **Impact** : **aucune réservation payée par wallet ne pouvait jamais aboutir en conditions réelles** — un solde correctement rechargé était invisible du point de vue du débit.
- **Fix** : unification sur `agencies.deposit_balance` via `debitPartnerCredit` (déjà bien conçu — verrouillage `FOR UPDATE`, idempotence Redis — mais jamais appelé avant ce fix), avec ajout d'un paramètre `txOverride` pour composer atomiquement avec la transaction d'insertion de la réservation.
- **Tests** : 2 nouveaux tests `txOverride` sur `debitPartnerCredit` (`lib/pro/__tests__/booking-actions.test.ts`) + 151/151 tests existants.
- **Commit** : `4d83ec8` (PR #30).
- **Risque résiduel** : `lib/wallet/actions.ts` (Store B) n'a pas été supprimé (documenté comme déprécié en tête de fichier) — voir WALLET-11.

### WALLET-02 — Aucun checkout B2C autonome n'existe (CRITICAL, NON RÉSOLU)
- **Composant affecté** : `lib/booking/actions.ts::createReservationFromDraft`, utilisé à la fois par `components/booking/checkout-form.tsx` (storefront public) et `components/pro/booking-travelers-form.tsx` (portail B2B)
- **Root cause** : la fonction résout l'agence via `getCurrentPartnerProfile(user.id)` (`lib/auth/partner-profile.ts`), qui **retourne `null` pour tout rôle autre que `partner_owner`, `partner_agent` ou `super_admin`** (ligne 86-93 : "Autres rôles (manager, agent_resa, etc.) → pas d'accès"). Un visiteur anonyme échoue avant même cette étape : `supabase.auth.getUser()` renvoie `{user: null}` → `return { ok: false, error: "Non authentifié" }` immédiat.
- **Reproduction** : lecture de code intégrale de `createReservationFromDraft` (lignes 195-208) et `getCurrentPartnerProfile` (lignes 62-93) — aucun chemin ne permet à un utilisateur sans profil partenaire B2B de créer une réservation.
- **Impact** : le formulaire de checkout du storefront public (`components/booking/checkout-form.tsx`), bien que rendu et fonctionnel visuellement, **ne peut être complété par aucun visiteur B2C réel** sans qu'il soit d'abord provisionné comme utilisateur partenaire d'une agence. Il n'existe par ailleurs **aucun concept de wallet B2C** dans le schéma (`wallets`/`wallet_recharge_requests`/`agencies.deposit_balance` sont tous scopés agence B2B).
- **Analyse** : ceci n'est **pas un bug de câblage** comme WALLET-01 (une correction localisée), mais une **absence de fonctionnalité fondamentale** avec plusieurs directions architecturales possibles et mutuellement exclusives :
  1. Guest checkout + paiement carte par réservation (contourne le wallet entièrement pour le B2C, nécessite une vraie intégration PSP) ;
  2. Compte B2C + nouveau concept de "wallet client" distinct du wallet agence ;
  3. Le modèle métier réel est "storefront public en consultation seule, réservation finalisée par un agent Easy2Book" (pattern SaaS agence de voyage légitime) — auquel cas ce n'est pas un bug mais un choix produit à documenter clairement dans l'UI (le formulaire ne devrait pas laisser croire à un visiteur qu'il peut réserver seul).
- **Décision** : **non implémenté délibérément**. Construire l'une de ces trois directions sans confirmation du produit serait un choix architectural majeur et irréversible (nouvelle table, nouveau flux de paiement, nouvelle UX) pris unilatéralement — hors du mandat de cet audit ("privilégier... compatibilité avec l'architecture actuelle" ne s'applique pas quand aucune des 3 directions n'est *actuellement* l'architecture).
- **Résidu** : bloquant. C'est la raison principale du verdict NOT READY (§16).

### WALLET-03 — Aucun email/notification n'a jamais été envoyé pour une réservation ou une recharge réelle
- **Composant affecté** : `lib/booking/actions.ts`, `lib/omra/booking-actions.ts`, `lib/transfers/actions.ts`, `lib/finance/recharge-actions.ts`, `lib/admin/agencies-actions.ts`
- **Root cause** : `sendEvent()` (le seul point d'entrée typé pour déclencher un événement Inngest) n'était appelé que depuis **un seul** des cinq chemins qui en avaient besoin (`lib/booking/actions.ts`), et cet appel utilisait `inngest.send()` directement (non typé) avec un payload `{customerId, module}` au lieu de `{customerEmail, customerName, hotelName, checkIn, checkOut, nights, adults, children}` réellement attendu par `processConfirmedBooking`. `lib/omra/booking-actions.ts`, `lib/transfers/actions.ts` et `lib/finance/recharge-actions.ts` n'envoyaient aucun événement.
- **Reproduction** : `grep -rn "inngest.send(\|sendEvent(" lib/` → un seul appel réel hors du client lui-même, payload comparé champ par champ au destructuring du handler.
- **Impact** : voucher hôtel jamais envoyé, confirmation Omra jamais envoyée, confirmation transfert (email + SMS chauffeur) jamais envoyée, notification de recharge wallet jamais envoyée — pour **aucune réservation ou recharge réelle depuis la création de ces 4 fonctions Inngest**.
- **Fix** : les 5 chemins utilisent maintenant `sendEvent()` typé avec le payload exact attendu, gaté sur la présence d'un destinataire réel (pas d'email → pas d'événement plutôt qu'un envoi vide). `processTransferConfirmed` durci pour ignorer proprement une étape email sans destinataire (même pattern que la garde Twilio déjà existante).
- **Tests** : protection de régression par les types (`sendEvent<K>(name, data: Events[K]["data"])` — un futur payload incorrect est une erreur de compilation, pas un no-op silencieux). 151/151 tests existants.
- **Commit** : `407aa4c`.
- **Résidu** : aucun test d'intégration réel (aucun serveur Inngest local disponible dans ce sandbox) — validé par lecture de code + garantie de type uniquement.

### WALLET-04 — Le webhook PSP ne confirmait jamais réellement un paiement
- **Composant affecté** : `app/api/payment/webhook/route.ts`
- **Root cause** : la vérification de signature (Stripe HMAC-SHA256, SPS HMAC-SHA512) était correcte et solide, mais le `switch` de dispatch était un stub `// TODO Sprint 2` qui se contentait de logger — aucun wallet n'était jamais crédité, aucune `wallet_recharge_requests` jamais marquée validée/rejetée, quel que soit le contenu réel de l'événement PSP.
- **Reproduction** : lecture intégrale de la route (174 lignes) — le `switch(event.type)` ne contient que des `console.log`.
- **Impact** : la recharge wallet en ligne par carte (`method: card_international`) n'a jamais pu fonctionner de bout en bout, même si elle avait été initiée.
- **Fix** : dispatch réel — corrélation par `wallet_recharge_requests.payment_reference`, vérification stricte montant+devise+référence (`matchesPendingRecharge`, jamais confiance au seul payload PSP), crédit via `creditRechargeRequest` (même fonction que l'approbation admin manuelle — un seul endroit qui sait créditer un wallet), idempotence event-level (`payment_events`) ET business-level (statut `pending` re-vérifié, empêche un second `event_id` pour le même paiement de re-créditer), journal brut de chaque requête signée dans `psp_webhooks` (jamais écrit avant ce fix).
- **Tests** : 14 tests logique pure (`webhook-logic.test.ts`) + 25 tests Virtual Payment Provider (signature + classification + matching bout-en-bout par les vraies fonctions).
- **Commit** : `c691731`, `cc8defa`.
- **Résidu majeur (documenté dans le fichier lui-même)** : **aucune intégration Stripe/SPS réelle n'existe côté initiation** — rien ne crée de `PaymentIntent` ni de session SPS. Ce fix rend la confirmation correcte pour le jour où l'initiation sera construite ; il ne rend pas le paiement en ligne utilisable aujourd'hui. Voir WALLET-12.

---

## 3. Findings — HIGH

| ID | Composant | Problème | Fix | Commit |
|---|---|---|---|---|
| WALLET-05 | `lib/admin/agencies-actions.ts::adminRechargeWallet` | Incrémentait `agencies.deposit_balance` en SQL brut sans jamais écrire de `partner_credit_movements` — ledger structurellement incomplet pour toute recharge admin directe | Verrouillage `FOR UPDATE`, calcul JS, insertion du mouvement de crédit (même pattern que `validateRechargeRequest`) | `6a7ebb1` |
| WALLET-06 | `wallet_recharge_requests` (RLS) | RLS jamais activée depuis la création de la table (absente de 0001/0005/0006/0010/0011/0012) — n'importe quel utilisateur authentifié lisait/modifiait les demandes de recharge de toutes les agences | `ENABLE ROW LEVEL SECURITY` + policy `current_agency_id() OR is_super_admin()` + `FORCE` | `3220108`, appliqué en prod |
| WALLET-07 | `omra_pilgrims` (RLS) | RLS jamais activée — passeport, date/lieu de naissance, conditions médicales, contact d'urgence exposés cross-tenant | Même pattern, appliqué après vérification que le seul écrivain est tenant-context-safe | `e9b1c40`, appliqué en prod |
| WALLET-08 | `payment_events` (RLS) | RLS jamais activée — registre d'idempotence webhook lisible/altérable par tout utilisateur authentifié | Activée **après** avoir migré le webhook vers `withSystemContext()` (sinon RLS aurait cassé silencieusement l'insertion d'idempotence — même cause que BUG-01 du rapport de stress-test antérieur) | `c691731` (`0018`), appliqué en prod |
| WALLET-09 | Génération de facture | `throw` inconditionnel jamais atteint par aucun flux réel ; page `/pro/factures` toujours vide (tableau codé en dur) ; boutons Télécharger/Consulter/Générer un avoir sans handler | `generateInvoiceForReservation()` réel, tenant-scopé, idempotent au niveau DB (index unique partiel sur `reservation_id`), appelé après chaque réservation confirmée ; page factures lit désormais les vraies lignes | `970c98c` |
| WALLET-10 | `agencies.deposit_balance`, `wallets.balance` | Rien au niveau DB n'empêchait un solde négatif (seule l'application le faisait) | `CHECK (... >= 0)`, pré-vérifié (0 solde négatif existant) avant application | `9f07f70`, appliqué en prod |

---

## 4. Findings — MEDIUM

| ID | Sujet | Détail |
|---|---|---|
| WALLET-11 | 3 stores wallet parallèles | Store B (`wallets`/`wallet_transactions`, `lib/wallet/actions.ts`) et Store C (`wallet_accounts`/`wallet_ledger`, `lib/finance/wallet-service.ts` + `lib/booking/workflow-pipeline.ts`) sont du code mort (zéro appelant live confirmé par grep) mais **pas supprimés** — risque de confusion pour un futur développeur, documenté en tête de fichier plutôt que supprimé (prudence : code fonctionnel, zéro couverture de test à casser accidentellement, hors mandat "ne pas faire de gros refactor") |
| WALLET-12 | Pas d'initiation de paiement en ligne | Aucun appel sortant vers Stripe/SPS n'existe (`STRIPE_SECRET_KEY`/`SPS_MERCHANT_ID` déclarés dans `.env.example` mais jamais utilisés) — le fix webhook (WALLET-04) confirme correctement un paiement qui ne peut pas encore être initié |
| WALLET-13 | Facture sans PDF téléchargeable | `generateInvoiceForReservation` crée un enregistrement financier réel et idempotent mais ne génère pas de PDF (aucune librairie PDF générique installée — seul `@react-pdf/renderer`, utilisé uniquement pour le voucher hôtel) ; boutons UI "Télécharger PDF"/"Générer un avoir" restent sans handler |
| WALLET-14 | RLS incomplète sur le module Omra | `omra_packages`, `omra_allotments`, `omra_flights`, `omra_room_allocations` restent RLS-désactivées — non corrigées cette passe : 2 n'ont pas de colonne `agency_id` directe (policy à jointure nécessaire), 2 pourraient nécessiter un accès public en lecture pour le storefront B2C (non vérifié) ; verrouiller à l'aveugle risquait de casser la navigation publique |
| WALLET-15 | Pas de test de concurrence réel exécuté | Ce sandbox n'a pas de `DATABASE_URL` — le verrouillage `SELECT ... FOR UPDATE` a été vérifié par lecture de code sur tous les chemins d'argent (`debitPartnerCredit`, `creditRechargeRequest`, `validateRechargeRequest`, `adminRechargeWallet`) mais aucune vraie course concurrente n'a été exécutée contre une base réelle dans cette session |
| WALLET-16 | Isolation RLS non re-testée en live cette session | Le rôle `app_runtime` (non-`BYPASSRLS`, celui réellement utilisé par `DATABASE_URL` en production) n'est pas accessible depuis la connexion Supabase MCP de ce sandbox (`SET ROLE app_runtime` → `permission denied`, la connexion utilise `postgres`, `rolbypassrls=true`) — les nouvelles policies (WALLET-06/07/08) suivent exactement le pattern déjà prouvé 6/6 PASS sur d'autres tables dans `STRESS_TEST_B2B_B2C_REPORT.md`, mais n'ont pas été re-testées avec une preuve live fraîche dans cette session |
| WALLET-17 | Autres tables RLS-désactivées (hors scope wallet strict) | `inventory_locks`, `yield_rules`, `products`, `currencies`, `audit_logs` — trouvées par l'audit, hors périmètre wallet/paiement, signalées pour une passe de sécurité ultérieure |

---

## 5. Findings — LOW

| ID | Sujet | Détail |
|---|---|---|
| WALLET-18 | Code mort avec `getDb()` brut | `lib/repositories/*.ts` (5 fichiers), `lib/finance/wallet-service.ts`, `lib/booking/workflow-pipeline.ts`, `lib/audit/logger.ts` : zéro appelant live confirmé — latent si jamais câblés sans contexte tenant/système, aucun impact aujourd'hui |
| WALLET-19 | `lib/booking/inventory.ts::cleanExpiredLocks` | Seul appelant vivant : `app/api/cron/cleanup/route.ts`. Utilise `getDb()` brut — fonctionne aujourd'hui car `inventory_locks` n'a pas de RLS (WALLET-17), mais silencieusement cassé si RLS y était un jour activée sans passer par `withSystemContext()` |
| WALLET-20 | `debitPartnerCredit`'s `dbOverride ?? getDb()` fallback | Jamais atteint en production (les 3 appelants live passent toujours `txOverride`) — seul le code de test l'utilise ; un futur appelant qui omettrait `txOverride` heurterait silencieusement le blackout RLS (BUG-01) |

---

## 6. Architecture Wallet

**Store canonique unique retenu** : `agencies.deposit_balance` (solde) + `partner_credit_movements` (ledger append-only, jamais de suppression — REVERSAL/ADJUSTMENT uniquement). Tous les mouvements — crédit (recharge admin, recharge validée, webhook PSP) et débit (réservation) — passent maintenant par deux points d'entrée uniques :
- `creditRechargeRequest()` (`lib/finance/wallet-credit.ts`) — verrouille l'agence `FOR UPDATE`, calcule le nouveau solde, insère le mouvement, marque la demande validée. Appelé par `validateRechargeRequest` (approbation admin) ET le webhook PSP (WALLET-04).
- `debitPartnerCredit()` (`lib/pro/booking-actions.ts`) — même verrouillage, vérifie `solde >= montant` avant tout, refuse sinon (`INSUFFICIENT_FUNDS`), idempotence Redis. Appelé par les 3 chemins de réservation live, toujours avec `txOverride` pour composer atomiquement avec l'insertion de la réservation.

`wallets`/`wallet_transactions` (Store B) et `wallet_accounts`/`wallet_ledger` (Store C, `financials.ts`) existent toujours en base mais sont du code mort côté application — documentés, non supprimés (WALLET-11).

---

## 7. Architecture Paiement

Webhook PSP (`app/api/payment/webhook/route.ts`) : signature → idempotence event-level (`payment_events`, `ON CONFLICT DO NOTHING`, sous `withSystemContext()`) → idempotence business-level (statut `pending` re-vérifié) → classification (`succeeded`/`failed`/`refunded`/`unknown`) → matching strict référence/devise/montant contre la `wallet_recharge_requests` visée → crédit via `creditRechargeRequest` → journal brut dans `psp_webhooks` → événement `wallet/credited`.

**Aucune abstraction PSP formelle** (pas de `PaymentProvider` interface unifiée Stripe/SPS) n'a été construite cette session — la logique de normalisation (`lib/payment/webhook-logic.ts`) joue ce rôle de façon minimale (deux fonctions `normalizeStripeEvent`/`normalizeSpsEvent` → une forme commune). Une vraie abstraction PSP n'a de sens qu'une fois l'initiation de paiement construite (WALLET-12) — prématuré de la sur-concevoir avant.

---

## 8. Flux B2C

Voir WALLET-02. **N'existe pas fonctionnellement.** Le storefront public affiche des offres et un formulaire de checkout, mais toute soumission par un visiteur non provisionné comme partenaire B2B échoue à l'authentification ou à la résolution du profil.

---

## 9. Flux B2B

Fonctionnel et testé de bout en bout au niveau code (pas de test d'intégration live, voir WALLET-15/16) : agent B2B authentifié → `createReservationFromDraft`/`createOmraBooking`/`createTransferBooking` → vérification solde (`debitPartnerCredit` refuse si insuffisant, message explicite, aucun état partiel) → débit + création réservation dans une seule transaction atomique → facture générée → voucher/confirmation envoyé (si email disponible) → ledger alimenté → audit_events alimenté.

Recharge B2B : soumission agent → approbation admin (`validateRechargeRequest`, verrouillage `FOR UPDATE`) OU webhook PSP (WALLET-04, en attente d'initiation réelle) → `creditRechargeRequest` → notification `wallet/credited`.

---

## 10. Sécurité Webhook

Signature vérifiée AVANT tout traitement (`timingSafeEqual`, pas de comparaison naïve). Montant/devise/référence re-vérifiés contre la demande de recharge attendue — jamais confiance au seul payload PSP (`matchesPendingRecharge`). Idempotence à deux niveaux (event_id ET statut business). Aucune donnée sensible (secrets, tokens, coordonnées bancaires) n'est loggée — seuls `eventId`/`eventType`/`provider`/`result` apparaissent dans les logs applicatifs ; le payload brut complet est stocké en base (`psp_webhooks`), pas dans les logs.

---

## 11. RLS / Autorisation

| Table | Avant cet audit | Après |
|---|---|---|
| `wallet_recharge_requests` | RLS désactivée | ✅ Activée + policy (WALLET-06) |
| `omra_pilgrims` | RLS désactivée | ✅ Activée + policy (WALLET-07) |
| `payment_events` | RLS désactivée | ✅ Activée + policy système uniquement (WALLET-08) |
| `psp_webhooks` | RLS déjà active (policy `is_super_admin() OR agency_id = current_agency_id()`) | Inchangée — vérifiée compatible avec l'écriture `withSystemContext()` du webhook |
| `agencies`, `partner_credit_movements`, `partner_invoices` | RLS déjà active (migrations antérieures) | Inchangée |
| `omra_packages`, `omra_allotments`, `omra_flights`, `omra_room_allocations`, `inventory_locks`, `yield_rules`, `products`, `currencies`, `audit_logs` | RLS désactivée | **Toujours désactivée** — WALLET-14/17, documenté, non corrigé à l'aveugle |

Toutes les nouvelles policies suivent strictement le pattern `current_agency_id() OR is_super_admin()` + `FORCE ROW LEVEL SECURITY` déjà en production depuis la migration `0012` — jamais l'ancien pattern `auth.uid()` (inerte sur la connexion `postgres-js` directe utilisée par cette application).

---

## 12. Intégrité du Ledger

`partner_credit_movements` est append-only par convention applicative (aucune fonction du code ne fait `UPDATE`/`DELETE` dessus — seulement `INSERT`). Chaque mouvement porte `balanceAfter` (snapshot), une `reference` traçable, et `createdByUserId` (null uniquement pour les crédits déclenchés par webhook, où il n'y a pas d'utilisateur humain — documenté dans le mouvement via `description`). Aucune transaction financière n'a été supprimée ou modifiée rétroactivement dans cet audit — chaque correctif de type "gap de traçabilité" (WALLET-05) a ajouté l'écriture manquante, jamais réécrit l'historique.

---

## 13. Idempotence

| Opération | Mécanisme |
|---|---|
| Débit réservation | Redis (`e2b:idem:debit:${idempotencyKey}`, clé = `booking-debit:${reservationId}`) + verrouillage `FOR UPDATE` |
| Recharge admin/validation | Verrouillage `FOR UPDATE` sur `wallet_recharge_requests` (empêche double-validation concurrente) |
| Facture | Index unique DB partiel `partner_invoices_reservation_uniq` (WHERE `reservation_id IS NOT NULL`) — insert-or-fetch sur conflit `23505`, pas de vérification applicative seule |
| Webhook — event-level | `payment_events.event_id` PRIMARY KEY + `ON CONFLICT DO NOTHING` |
| Webhook — business-level | Statut `pending` re-vérifié avant tout crédit (empêche un second `event_id` pour le même paiement de re-créditer) |

---

## 14. Couverture de tests

190/190 tests unitaires passants (151 pré-existants + 39 nouveaux cette session : 2 `txOverride` sur `debitPartnerCredit`, 14 `webhook-logic`, 7 `signing`, 18 `virtual-provider`, 0 supprimé). 4 quality gates (`typecheck`/`lint`/`test`/`build`) exécutés et clean à chaque commit. Aucun test de concurrence ou d'intégration DB réel exécuté (WALLET-15) — limite honnête de l'environnement, pas une omission de méthode.

---

## 15. Risques résiduels (résumé)

1. **CRITICAL — bloquant** : pas de checkout B2C fonctionnel (WALLET-02).
2. **HIGH** : pas d'initiation de paiement en ligne réelle (WALLET-12) — le webhook confirme un paiement qui ne peut pas encore être déclenché.
3. **MEDIUM** : pas de test de concurrence/isolation live exécuté dans cette session (WALLET-15/16) ; RLS incomplète sur le module Omra catalogue (WALLET-14) ; facture sans PDF téléchargeable (WALLET-13) ; 3 stores wallet coexistent dont 2 morts (WALLET-11).
4. **LOW** : code mort avec `getDb()` brut latent (WALLET-18/19/20).

---

## 16. Production Readiness — Conclusion

**🔴 NOT READY**

Le flux B2B (agence authentifiée, wallet pré-financé, staff-mediated) est maintenant **matériellement solide** : débit/crédit unifiés sur un seul store canonique, atomiques, verrouillés, idempotents, avec ledger complet, RLS correcte sur les tables concernées, webhook fonctionnel en attente d'initiation, facturation réelle et idempotente, notifications correctement déclenchées.

Mais la mission demandait explicitement de garantir "qu'un client B2C **ou** une agence B2B puisse réserver un produit uniquement lorsque son solde disponible couvre le montant" — et **le chemin B2C n'existe pas fonctionnellement** (WALLET-02, CRITICAL, non résolu). Un visiteur anonyme ne peut pas finaliser de réservation aujourd'hui, quel que soit son solde (puisqu'il n'a pas de solde). Conformément à l'instruction reçue ("ne déclare jamais READY si un Critical... bloque encore un flux financier"), le verdict global ne peut être ni 🟢 ni 🟡.

**Condition de sortie du NOT READY** : une décision produit explicite sur la direction B2C (guest checkout + PSP, wallet client dédié, ou storefront-consultation-seule assumé) — après quoi le travail d'implémentation correspondant, suivi d'un nouveau cycle audit → correction → test.
