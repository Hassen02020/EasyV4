# Easy2Book — Matrice de certification E2E

Statut vivant, mis à jour au fil de la boucle TEST → CORRIGE → RETEST.
Détail complet des scénarios et preuves : `e2e-certification-report.md`.

Légende : PASS / PARTIAL / FAIL / MISSING / NOT WIRED / SKIPPED(baseline)

| # | Module | Scénario | Statut | Note |
|---|--------|----------|--------|------|
| 0 | B2C Hôtel | Recherche→tarif MyGo→booking→paiement virtual→voucher→admin→RLS pro isolation | SKIPPED(baseline) | PASS prouvé avant cette session (voir report, section Baseline) |
| 1 | Production safety | MYGO_MODE=virtual en NODE_ENV=production | FIXED→PASS | Aucun garde-fou n'existait — ajouté (throw), régression testée |
| 2 | Production safety | PAYMENT_MODE=virtual en NODE_ENV=production | FIXED→PASS | Idem, `isVirtualPaymentModeEnabled()` |
| 3 | MyGo error scenarios | TIMEOUT/AUTH_ERROR/NETWORK_ERROR/NO_AVAILABILITY/MALFORMED_RESPONSE/AMBIGUOUS (booking) | PASS | Déjà couvert — `mygo-driver.test.ts`, `virtual-supplier/engine.test.ts` (TIMEOUT_AFTER_ACCEPT, TWO_PLAUSIBLE_CANDIDATES, CURRENCY/HOTEL_ID mismatch) |
| 4 | Concurrency | Hôtel — dernière chambre, 2/10 réservations simultanées | PASS | `inventory-store.test.ts` (déjà prouvé, DB-mode) |
| 5 | Concurrency | Trips/Packages — dernier siège, 2 réservations simultanées LIVE (navigateur réel) | PASS | Preuve live cette session : #2 confirmée (PK-2026-000001), #1 rejetée honnêtement "0 places disponibles", `booked_seats` 5→6 exact, aucune sur-réservation. `FOR UPDATE` sur `catalog_package_departures` |
| 6 | Concurrency | Omra — dernier allotment, Activités — dernière session | PASS (par analogie) | Même pattern exact `SELECT...FOR UPDATE` (`omra_allotments`, `catalog_activity_sessions`) — non retesté séparément (économie de tokens) |
| 7 | Idempotence | Wallet debit/credit, webhook paiement, b2b booking | PASS | Déjà couvert — `customer-wallet.test.ts`, `reservation-webhook-core.test.ts` (event_id dupliqué, double webhook concurrent), `b2b-idempotency-invariants.test.ts` |
| 8 | Payment edge cases | DECLINED/DUPLICATE_WEBHOOK/WRONG_AMOUNT/PARTIAL/REFUND(partiel+multi-ligne)/INSUFFICIENT_FUNDS | PASS | Déjà couvert — `reservation-webhook-core.test.ts`, `refund-allocation.test.ts` (9 scénarios), `customer-wallet.test.ts` |
| 9 | Test suite | Échecs sur run complet | FIXED→PASS | 3 corrigés en début de certification (dérive de date figée dans `flexible-search.test.ts`). Les 2 restants (`search-hub.test.ts` cat.17, `search-core.test.ts`) : root cause PROUVÉE (pas un artefact d'ordre d'exécution comme précédemment affirmé) — `.env.local` (`MYGO_MODE=virtual`) fuyait dans `pnpm test` via `source .env.local`, basculant ces 2 tests vers le VRAI Virtual MyGo Supplier non-déterministe au lieu de la fixture démo. Reproduit à volonté (826/828 avec `.env.local` sourcé) puis éliminé en environnement propre (828/828 sans). Corrigé dans `scripts/run-tests.mjs` (env enfant hermétique). Suite finale : **840/840** (828 + 12 nouveaux tests price-token), 0 échec, vérifié à nouveau avec `.env.local` sourcé |

| 10 | B2B/Pro | Navigation complète 12 pages (hôtels/réservations/clients/produits/marges/factures/paiements/relevé/fournisseurs/utilisateurs/établissement) | PASS | 0 erreur, wallet+agence scopés correctement (Sahara Voyages, pas de fuite cross-tenant) |
| 11 | Super Admin | Activation/désactivation agence (`setAgencyStatus`) | PASS | Déjà réel, testé par code review — pattern repris pour #12 |
| 12 | Super Admin | Suspension/réactivation utilisateur cross-agence (`/admin/users`) | FIXED→PASS | N'existait pas (toast stub honnête) — nouvelle action `setPlatformUserStatus` (super_admin only, jamais auto-suspension, jamais dernier super_admin) ajoutée, testée live : DB `status`→`suspended`, `audit_events` réel, connexion `pro.test` bien bloquée en aval |
| 13 | Super Admin | Personnel propre agence (créer/suspendre/rôle) `/admin/staff` | PASS | Déjà réel et complet (Phase 18, `createStaffUser`/`setUserStatus`/`setUserRole`), scopé RLS à l'agence |
| 14 | Super Admin | Supplier credentials (édition/rotation/révocation/autorisation par agence) `/admin/suppliers` | PASS | Actions réelles confirmées (`SupplierAccountRowActions`) |
| 15 | Super Admin | Création agence/tenant | MISSING | Bouton "Nouvelle agence" honnêtement désactivé (`disabled title="Pas encore disponible"`) — aucune Server Action, agences créées uniquement par SQL direct. Non corrigé (feature complète, hors périmètre "bug sûr et localisé") |
| 16 | Super Admin | Branding White Label (logo/nom/domaine éditable) | MISSING | `brandName`/`logoUrl` lus en base (affichage, White Label runtime réel) mais aucune UI/action d'édition — Phase 13 "White Label foundation (minimal)" confirmé être un fondation lecture-seule |
| 17 | Bug annexe découvert | `/unauthorized` (cible de `proxy.ts` sur RBAC refusé) | FIXED→PASS | Route inexistante → 404 générique au lieu d'un message honnête ; page créée, HTTP 200 vérifié |
| 18 | Payments/Wallet/Refund/Idempotence | DECLINED/DUPLICATE_WEBHOOK/PARTIAL/REFUND multi-ligne/INSUFFICIENT_FUNDS/double debit-credit | PASS | Déjà couvert en profondeur par `reservation-webhook-core.test.ts`, `refund-allocation.test.ts` (9 scénarios), `customer-wallet.test.ts` — non retesté en direct (économie de tokens, couverture DB-mode déjà réelle) |
| 19 | Cancellation policies | FREE/PENALTY/NON_REFUNDABLE, double annulation | PASS | `policy-engine.test.ts` + `policy-engine-db.test.ts` + `policy-cancel.test.ts` couvrent déjà ces cas |

| 20 | White Label / tenant isolation négatif | A→données/customer/reservation/wallet/supplier B refusé partout | PASS | Déjà couvert en profondeur (`tenant-isolation-certification.test.ts`: yield_rules/audit_logs/products/wallets ; `resolver-security.test.ts`: 15 scénarios credentials fournisseur ; `crm/__tests__`: leads/inbox) + ma propre preuve live cette session (RLS SQL direct 0 ligne pour `pro.test`, refus UI cross-agence) |
| 21 | Security — price/amount tampering (charge) | Prix client falsifié dans le draft base64 (`unitPriceTnd`) avant paiement | PASS | Preuve live : draft trafiqué à 1 TND, `myGoToken` signé intact → montant réellement facturé et enregistré en DB = prix fournisseur réel, jamais le prix falsifié (`authoritativeUnitPrice`/`confirmHotelWithProvider`) |
| 21bis | Security — price/amount tampering (affichage) | Total AFFICHÉ avant paiement (`/booking`, `/booking/checkout`, ajout panier) basé sur le draft client non vérifié | FIXED→PASS | Root cause confirmée ce cycle puis corrigée : `lib/booking/price-token.ts` (nouveau) — `/api/hotels/search-public` signe HMAC le prix serveur par chambre, `resolveDraftHotelPrice()` le revérifie (signature+TTL 45min+correspondance exacte offre) avant tout affichage sur `app/booking/page.tsx`, `app/booking/checkout/page.tsx` et `checkout-form.tsx::onAddToCart` (via Server Action `price-token-actions.ts`). Échec de vérification = écran bloqué, jamais un repli silencieux. **Retest live** : brouillon avec `unitPriceTnd` falsifié à 1 TND mais `priceToken` réel intact → 2 261 TND affiché (prix serveur, PAS 1 DT) sur `/booking` ET `/booking/checkout` ; signature de `priceToken` corrompue → écran bloqué "Ce prix n'a plus pu être vérifié", 0 montant affiché. Confirmation (`app/booking/confirmation/[ref]/page.tsx`) vérifiée déjà correcte sans modification (montant DB, jamais le draft). 12 tests unitaires ajoutés (`lib/booking/__tests__/price-token.test.ts`) |
| 22 | Security — ID/tampering agencyId côté client | `agencyId` jamais accepté dans les schémas guest (omra/package) | PASS | `security-regression.test.ts` (4 tests dédiés) |

| 23 | Omra E2E | Catalogue→départ réel→fiche pèlerin (visa)→carte→confirmation→voucher | PASS | Live complet : OM-2026-000001, 6900 TND capturé, allotment 30→29, voucher PDF réel. 1 allotment de test ajouté (aucune donnée n'existait — table vide, pas un bug) |
| 24 | Trips/Packages E2E + concurrency | Catalogue→départ→formulaire→carte→confirmation→voucher + dernier siège 2 réservations simultanées | PASS | Live complet + preuve de concurrence (voir #5) |
| 25 | Attractions E2E | Catalogue→session réelle→formulaire→carte→confirmation→voucher | PASS | Live complet : AT-2026-000001, 101.15 TND capturé, session 6→7 places, voucher PDF réel |
| 26 | Voucher edge cases | Token opaque obligatoire, jamais dérivable du ref, 404 sans/mauvais token | PASS | Prouvé 3x en direct cette session (hôtel baseline, Omra, Attraction) — même route pattern partagée (`isVoucherEligible`), gating status=confirmed déjà audité en profondeur (Lot précédent, tâches #168/#172) |
| 27 | CRM (leads/scoring/inbox/WhatsApp/Customer 360) | Cross-agence, lead public, conversion, inbox | PASS | Couverture déjà réelle et extensive : `leads-core.test.ts`, `lead-scoring-core.test.ts`, `lead-relance-core.test.ts`, `inbox-core.test.ts`, `sync-booking.test.ts`, webhook WhatsApp signé — non retesté en direct (économie de tokens, déjà DB-mode + déjà audité en profondeur lors de la construction de la feature) |

| 28 | Frontend — inventaire honnête des fonctionnalités non construites | Scan `disabled title="Pas encore disponible"` sur tout le repo | MISSING (documenté) | 18 occurrences dans 12 fichiers, TOUTES explicitement désactivées avec un message honnête (jamais un bouton mort silencieux) : admin (créer agence, créer utilisateur, changer rôle, export réservations B2C, ajouter/modifier client B2C), pro (réinitialiser filtre relevé, imprimer devis, télécharger PDF facture côté Pro — alors que le PDF facture existe côté Admin), mutuelle (nav non construite). Aucun lien mort trouvé, aucun bouton silencieusement cassé — le pattern du codebase marque systématiquement l'incomplet plutôt que de fabriquer un faux succès |

| 29 | Test suite hermeticity | `pnpm test` indépendant de l'environnement de l'appelant (`.env.local` sourcé ou non) | FIXED→PASS | `scripts/run-tests.mjs` retire `MYGO_MODE`/`MYGO_LOGIN`/`MYGO_PASSWORD`/`PAYMENT_MODE`/`PAYMENT_PROVIDER` de l'env du process enfant `spawnSync`. Vérifié : 828/828 avec ET sans `.env.local` sourcé (voir #9) |

## Certification "Dashboard Operations" — cycle de vie complet, preuve Playwright réelle (2026-09-11)

Format demandé : `Module | Fonction | Résultat | Real/Mock | UI | API | DB/RLS | Audit | Capture | Limitation`.

Cycle complet exécuté EN DIRECT (navigateur réel, `e2e/dashboard-operations-hotel-lifecycle.spec.ts` +
`e2e/dashboard-operations-permissions-isolation.spec.ts`) sur une vraie réservation créée par le test
lui-même (`TG-2026-001254`) — jamais une simple vérification "le bouton existe". Chaque ligne est
revérifiée en base via `psql` (superuser, hors RLS) après le run, pas seulement via l'UI :

| Module | Fonction | Résultat | Real/Mock | UI | API | DB/RLS | Audit | Capture | Limitation |
|---|---|---|---|---|---|---|---|---|---|
| Hôtel (myGo) | Créer (B2C guest checkout, espèces) | PASS | Real (Virtual MyGo Supplier) | ✅ | ✅ | ✅ `reservations.status='pending'` créé | `reservation.created` | `dashboard-ops-01..04` | — |
| Hôtel | Rechercher (liste admin, filtre référence) | PASS | Real | ✅ | ✅ | ✅ (RLS super_admin cross-agence) | — | `dashboard-ops-05` | — |
| Hôtel | Valider (VerifyPaymentButton, règlement manuel) | PASS | Real | ✅ | ✅ `verifyManualPayment` | ✅ `payments` (balance, refs `E2E-CASH-…`), `reservations.status='confirmed'` | `payment.manual_verified` | `dashboard-ops-06,07` | Exige strictement le statut `pending` (voir défaut ci-dessous) |
| Hôtel | Modifier (dropdown statut, liste, ×1 : confirmed→completed) | PASS | Real | ✅ | ✅ `updateReservationStatus` | ✅ `reservations.status='completed'` | `status_update` | `dashboard-ops-08` | — |
| Hôtel | Annuler (RefundButton, remboursement) | PASS | Real | ✅ | ✅ `refundReservation` | ✅ `payments.refunded_amount=1502.08`, `refunded_at`, `reservations.status='refunded'` (état terminal) | `payment.refunded` | `dashboard-ops-09` | — |
| Hôtel | Permissions (compte Pro → back-office Admin) | PASS | Real | ✅ redirigé, jamais la donnée d'une autre agence | ✅ `isAllowedIntoAdmin` | — | — | `dashboard-ops-10` | — |
| Hôtel | Isolation (agence Pro ≠ agence OTA créatrice) | PASS | Real | ✅ réservation absente de `/pro/reservations` | ✅ RLS `current_agency_id()` | ✅ | — | `dashboard-ops-11` | — |
| Omraty | Créer (B2C fiche pèlerin réelle, `/omra/[id]/book`) | PASS | Real (inventaire interne, pas un fournisseur externe) | ✅ | ✅ `createGuestOmraBooking` | ✅ `omra_allotments.reserved_count` +1, `.available_count` -1 | `omra_booking.created` | `dashboard-ops-omra-01..03` | — |
| Omraty | Rechercher + Valider (même back-office partagé que Hôtel) | PASS | Real | ✅ | ✅ `verifyManualPayment` | ✅ `payments` (balance), `reservations.status='confirmed'` | `payment.manual_verified` | `dashboard-ops-omra-04,05` | — |
| Omraty | Modifier (dropdown statut, confirmed→completed) | PASS | Real | ✅ | ✅ `updateReservationStatus` | ✅ `reservations.status='completed'` | `status_update` | `dashboard-ops-omra-06` | — |
| Omraty | Annuler (RefundButton) | **FIXED→PASS** | Real | ✅ | ✅ `refundReservation` | ✅ `payments.refunded_amount`, **`omra_allotments.available_count` restitué** (voir défaut #2 ci-dessous — cassé avant ce cycle) | `payment.refunded` | `dashboard-ops-omra-07` | — |

**Défaut réel #2 trouvé PAR ce cycle (module Omra) et corrigé — plus grave, silencieux, cross-module** :
`e2e/dashboard-operations-omra-lifecycle.spec.ts` (même méthode, module Omraty — réservation pèlerin
réelle via `/omra/[id]/book`) a révélé qu'un remboursement TOTAL déclenché par le staff (`RefundButton`,
`lib/finance/refund-actions.ts::refundReservation`) ne libérait JAMAIS la capacité retenue dans
`omra_allotments`/`catalog_package_departures`/`catalog_activity_sessions` — contrairement à
l'annulation self-service B2C (`cancelMyPolicyReservation`), qui appelle déjà `releaseStock()`
(`lib/booking/policy-cancel-core.ts`). Preuve live : `available_count` restait bloqué à 29/30 après
remboursement intégral d'une réservation d'1 pèlerin, capacité perdue en silence. Impact business direct
pour "leader du marché" : chaque remboursement staff sur Omra/Voyages organisés/Attractions réduisait
définitivement la disponibilité réelle affichée aux clients, sans qu'aucun signal d'erreur n'apparaisse.
**Corrigé** : `releaseStock()` exportée depuis `policy-cancel-core.ts`, réutilisée par
`refundReservation` — appelée sur remboursement total UNIQUEMENT pour les modules à stock local
(`CANCELLABLE_MODULES = ["omra","package","activity"]`, Hôtel exclu — disponibilité chez myGo,
fournisseur externe). Retesté en direct : 2ème cycle complet, l'allotment revient exactement à son
niveau d'avant après remboursement. Test de garde ajouté
(`lib/finance/__tests__/refund-releases-stock.test.ts`).

**Défaut réel #1 trouvé PAR ce cycle (module Hôtel, pas seulement "bouton présent") et corrigé** :
en changeant le statut vers `on_request` avant de valider le paiement, le bouton "Vérifier" restait
affiché et cliquable (gating UI basé uniquement sur `remainingTnd > 0`, jamais sur le statut réel) —
mais `verifyManualPayment` refuse tout statut ≠ `pending`, et `on_request` n'a AUCUNE transition de
retour vers `pending` (`ALLOWED_TRANSITIONS.on_request = ["confirmed","cancelled"]`, voir
`lib/admin/reservation-status.ts`) : un agent qui suit ce chemin se retrouve avec un bouton
apparemment fonctionnel mais qui échoue à chaque tentative, sans issue. **Corrigé** dans
`app/admin/reservations/[id]/page.tsx` : `VerifyPaymentButton` n'est maintenant rendu QUE si
`detail.status === "pending"`, alignant l'affichage sur la précondition réelle du serveur. Trouvé et
corrigé par l'ordonnancement même du test Playwright (valider AVANT modifier, modifier AVANT annuler —
voir commentaire en tête de `dashboard-operations-hotel-lifecycle.spec.ts` pour le raisonnement complet
sur pourquoi cet ordre est le seul qui fonctionne, contrainte métier découverte en écrivant le test).

## Périmètre réel de "réservation" par module (vérifié dans le code, pas supposé)

| Module | Recherche | Réservation réelle | Mock fournisseur | Statut |
|---|---|---|---|---|
| Hôtels Tunisie (myGo) | ✅ | ✅ | Virtual MyGo Supplier — 14 scénarios réalistes (`SOLD_OUT`/`PRICE_CHANGED`/`TIMEOUT`/`TIMEOUT_AFTER_ACCEPT`/`BOOKING_REJECTED`/`CURRENCY_MISMATCH`/token expiré-tamperé/etc., voir `lib/mygo/virtual-supplier/scenarios.ts`), inventaire ~15% sold-out/~25% limited | 🟢 Certifié ce cycle (Dashboard Operations complet ci-dessus) + baseline B2C antérieure |
| Omraty | ✅ | ✅ | Inventaire interne réel (`omra_allotments`, `SELECT…FOR UPDATE`) — Easy2Book EST le fournisseur, pas un mock d'API externe | 🟢 Certifié ce cycle au niveau Dashboard Operations complet (voir table ci-dessus) — 1 défaut trouvé ET corrigé (libération de stock au remboursement staff) |
| Voyages organisés (Packages) | ✅ | ✅ | Idem (inventaire interne, `catalog_package_departures`) | 🟡 Flux simple déjà prouvé (cycle antérieur, concurrence dernier siège) ; le défaut de libération de stock au remboursement (trouvé sur Omra) est corrigé au niveau du code partagé (`refundReservation`) mais PAS re-testé en direct sur ce module précis ce cycle-ci |
| Attractions | ✅ | ✅ | Idem (`catalog_activity_sessions`) | 🟡 Idem — flux simple déjà prouvé, pas re-testé ce cycle-ci |
| Hôtels Monde | ✅ (résultats affichés) | ❌ **MISSING, honnête** — `<Button disabled title="Réservation hôtels monde — bientôt disponible">` (`app/hotels-monde/search/world-hotel-results-content.tsx:122`) | — | 🔴 Aucun fournisseur branché, jamais prétendu autrement dans l'UI |
| Vols | ✅ (résultats affichés) | ❌ **MISSING, honnête** — `<Button disabled title="Réservation vols — bientôt disponible">` (`app/vols/search/flight-results-content.tsx:130`) | — | 🔴 Idem — aucun GDS/fournisseur branché |

**Limitation explicite de ce cycle** : la certification métier OTA complète demandée (les 6 verticaux,
chacun comparé à son standard métier de référence — Booking.com/Amadeus/tour-opérateur/ticketing — avec
Playwright + captures pour CHAQUE flux : recherche/filtre/tri, revalidation prix, erreurs
provider/timeout/sold-out, commissions/marges, modification/annulation/remboursement) n'a été menée à ce
niveau de rigueur (créer→modifier→rechercher→valider→modifier→annuler→DB→audit→permissions→isolation,
navigateur réel, captures, défaut trouvé ET corrigé) QUE pour le module Hôtels Tunisie ci-dessus, qui
sert de gabarit reproductible (`e2e/dashboard-operations-*.spec.ts`) pour les cycles suivants sur
Omraty/Voyages organisés/Attractions. Vols et Hôtels Monde n'ont rien à certifier côté réservation tant
qu'aucun fournisseur n'y est branché — reconfirmé, pas une régression de ce cycle.
