# Easy2Book — Rapport de certification finale E2E

Branche : `audit/e2e-certification` (base `main` @ `4b0ce49`, post PR #40)

## 1. Méthode

TEST → DÉTECTE → DIAGNOSTIQUE → CORRIGE → RETEST → RÉGRESSION → CONTINUE, sur infra locale réelle
(Postgres 16 avec RLS forcée identique à la prod, Virtual MyGo Supplier via la vraie stack client,
Virtual Payment Provider). Priorité aux zones non encore certifiées ; le parcours B2C Hôtel
(baseline) n'a pas été refait — voir section 2.

Chaque scénario est classé PASS / FAIL / MISSING / NOT WIRED avec preuve (DB, HTTP, capture d'écran,
ou test automatisé déjà existant cité par son nom de fichier). Le détail scénario-par-scénario est
dans `e2e-certification-matrix.md` ; ce rapport en fait la synthèse.

## 2. Baseline B2C Hôtel (déjà PASS avant cette session, non refait)

Recherche Tunis → myGoToken signé réel → booking 3 étapes → paiement carte → Virtual PSP
`/paiement-simule/[ref]` → réservation `confirmed` en DB avec `provider_booking_id` MyGo réel →
voucher PDF via token opaque (404 sans/mauvais token) → Admin gère la réservation (facture, voucher,
bouton Rembourser, historique d'audit) → Pro d'une autre agence : réservation invisible côté UI ET
`SELECT COUNT(*)` = 0 au niveau RLS direct.

## 3. Corrections appliquées pendant cette certification

| # | Fichier(s) | Problème réel trouvé | Correction |
|---|---|---|---|
| 1 | `lib/mygo/config.ts`, `lib/payment/virtual-payment-provider.ts` | Aucun garde-fou n'empêchait `MYGO_MODE=virtual` / `PAYMENT_MODE=virtual` en `NODE_ENV=production` — seuls des commentaires l'affirmaient, rien ne l'appliquait | `throw` explicite si virtuel + production. Tests dédiés ajoutés (`lib/mygo/__tests__/config.test.ts`, cas ajouté à `virtual-payment-provider.test.ts`) |
| 2 | `lib/admin/users-actions.ts` (nouvelle fonction `setPlatformUserStatus`), `components/admin/user-row-actions.tsx` | `/admin/users` (vue cross-agence, "Administration Système") n'avait aucune Server Action de suspension/réactivation — toast honnête admettant l'absence de câblage. **Important** : une première tentative a par erreur écrasé le fichier existant `users-actions.ts` (qui gérait déjà `/admin/staff` avec `createStaffUser`/`setUserStatus`/`setUserRole`) — restauré immédiatement via `git checkout`, puis la nouvelle fonction a été **ajoutée** (jamais retirée) sous un nom distinct pour ne pas collisionner avec la fonction existante scopée à une seule agence | Nouvelle action `setPlatformUserStatus` (super_admin uniquement, jamais auto-suspension, jamais suspendre le dernier super_admin actif de la plateforme), testée en direct : DB `status`→`suspended`, `audit_events` réel, connexion `pro.test` bien bloquée en aval par le check existant `validate-role.ts` |
| 3 | `app/unauthorized/page.tsx` (nouveau) | `proxy.ts` redirige vers `/unauthorized` sur RBAC refusé (y compris un compte suspendu, découvert en testant #2) — cette route n'existait pas, 404 générique au lieu d'un message honnête | Page créée, style cohérent avec `app/error.tsx` |
| 4 | `lib/hotel-suppliers/__tests__/flexible-search.test.ts` | 3 assertions utilisaient des dates de test codées en dur (`2026-09-01`/`2026-09-10`) désormais dans le passé réel (aujourd'hui : 2026-09-10) — `runFlexibleHotelSearch` n'accepte pas d'override d'horloge, contrairement aux tests purs de `generateFlexibleDateCandidates` | Dates remplacées par un calcul relatif à `Date.now()` (`futureDateStr()`) |

Aucune autre correction de code produit n'a été nécessaire — tout le reste testé était déjà correct.

## 3bis. Cycle de certification ciblé — 2 échecs `pnpm test` + tampering prix (post-PR #41)

Ce cycle répond à une exigence explicite : ne jamais qualifier des échecs de test de « pré-existants »
ou « artefact d'ordre d'exécution » sans preuve technique documentée, et corriger réellement le défaut
d'affichage de prix avant paiement identifié en section 4 de la version précédente de ce rapport
(au lieu de le remonter sans le corriger).

### A. Root cause PROUVÉE des 2 échecs `pnpm test` (`search-hub.test.ts` cat. 17, `search-core.test.ts` démo)

Le rapport précédent affirmait « artefact d'ordre d'exécution, cause non identifiée malgré
investigation ». Cette conclusion était **fausse** — root cause réelle trouvée par test contrôlé :

1. **Reproduction avec la cause suspectée** : `source .env.local && pnpm test` → 826/828, mêmes 2
   échecs, mêmes diffs (`/tmp/investigate-full.log`).
2. **Test décisif en environnement propre** : `env -i PATH="$PATH" HOME="$HOME"
   DATABASE_URL="$DATABASE_URL" pnpm test` (aucune autre variable héritée) → **828/828, 0 échec**
   (`/tmp/clean-env-test.log`).
3. **Root cause** : `.env.local` (dev/E2E navigateur, pilote le Virtual MyGo Supplier via des appels
   HTTP réels) définit `MYGO_MODE=virtual` / `MYGO_LOGIN=...`. Quand ces variables fuitent dans le
   process `pnpm test` (habitude de `source .env.local` avant de lancer les tests), `isDemoMode()`
   (`lib/mygo/search-core.ts`) bascule `search-hub.test.ts` et `search-core.test.ts` vers le VRAI
   Virtual MyGo Supplier au lieu de la fixture statique déterministe attendue — supplier qui émet
   volontairement un `searchId`/token neufs à chaque appel (non caché, `searchTtlSeconds=0` en mode
   virtuel, voir `lib/mygo/config.ts::resolveMyGoInfraDefaults`), cassant les assertions "deux appels
   identiques" écrites pour le mode démo.
4. Ce n'est PAS un artefact d'ordre d'exécution : ce sont deux méthodologies d'invocation différentes
   (avec vs sans `.env.local` sourcé) qui donnaient l'illusion d'une flakiness liée à l'ordre.

**Correction réelle** : `scripts/run-tests.mjs` construit désormais un `childEnv` explicite (copie de
`process.env` avec `MYGO_MODE`/`MYGO_LOGIN`/`MYGO_PASSWORD`/`PAYMENT_MODE`/`PAYMENT_PROVIDER` retirées)
passé à `spawnSync` — `pnpm test` est maintenant hermétique vis-à-vis de l'environnement de l'appelant,
que `.env.local` soit sourcé ou non. **Vérifié** : `source .env.local && pnpm test` → 828/828, 0 échec
(`/tmp/verify-hermetic.log`). Chaque test qui a réellement besoin du mode virtuel le pose lui-même
localement dans son propre fichier (`mygo-driver.test.ts`, `config.test.ts`,
`virtual-payment-provider.test.ts`) — aucun test ne dépendait légitimement de ces variables héritées
de l'extérieur.

### B. Correction du défaut d'affichage prix avant paiement (ex-finding #1 de la section 4)

**Bug confirmé** : le brouillon de réservation (`lib/booking/draft-store.ts`) est un base64url NON
SIGNÉ, entièrement modifiable côté client une fois dans l'URL `?d=`. `/booking` (étape 1) et
`/booking/checkout` calculaient le total affiché directement depuis `draft.unitPriceTnd` — falsifiable
— avant tout paiement. Le montant réellement **facturé** restait déjà correct (le serveur ignore
`draft.unitPriceTnd` à la capture, voir `lib/booking/guest-actions.ts`/`actions.ts`), mais un client
pouvait voir un montant puis en payer un autre.

**Correction — le serveur devient l'unique source de vérité pour l'affichage, pas seulement pour la
capture** :
- `lib/booking/price-token.ts` (nouveau) : `/api/hotels/search-public` signe (HMAC-SHA256,
  `PRICE_TOKEN_SECRET`) le prix exact qu'il vient de calculer pour {hôtel, chambre, board, dates,
  adultes, devise}, et l'attache à chaque chambre (`priceToken`, forme JSON libre, DTO canonique
  `RoomOfferDTO`/`HotelOfferDTO` intentionnellement inchangé). Aucun second appel fournisseur —
  décision Phase 30.1 (CheckRate) non rouverte : on rend infalsifiable un prix déjà légitimement
  calculé par le serveur, on ne recalcule rien.
- Le `priceToken` est propagé du résultat de recherche jusqu'au brouillon
  (`app/hotels/[id]/page.tsx`, `app/hotels/search/page.tsx` → `draft.metadata.priceToken`).
- `resolveDraftHotelPrice()` revérifie ce token (signature + TTL 45 min + correspondance EXACTE
  hôtel/chambre/board/dates/adultes/devise — jamais un token d'une autre offre accepté) et est
  appliqué aux DEUX écrans qui affichent un montant avant paiement : `app/booking/page.tsx` (étape 1)
  et `app/booking/checkout/page.tsx` (étape 3, paiement). En cas d'échec de vérification (absent,
  expiré, signature invalide, offre différente), l'écran **bloque** l'affichage ("Ce prix n'a plus pu
  être vérifié — relancez une recherche") au lieu d'un repli silencieux sur le prix client — jamais de
  montant non garanti affiché. Même garde appliquée à l'ajout panier
  (`components/booking/checkout-form.tsx::onAddToCart`, via la Server Action
  `lib/booking/price-token-actions.ts` — un composant client ne peut pas exécuter le HMAC lui-même).
- Écran de confirmation (`app/booking/confirmation/[ref]/page.tsx`) : vérifié déjà correct sans
  modification — `row.total` vient de `reservations.tndAmount`, dérivé de `myGoBooking.totalPrice`
  (réponse fournisseur réelle) + marge, jamais du brouillon client.
- 12 tests de non-régression ajoutés (`lib/booking/__tests__/price-token.test.ts`) : round-trip
  sign/verify, prix trafiqué dans le payload (rejeté), signature forgée (rejetée), token expiré
  (rejeté), réutilisation d'un token valide pour une AUTRE chambre/d'autres dates (`mismatch`),
  token absent/malformé, `signHotelSearchOffersInPlace` bout-en-bout, `resolveDraftHotelPrice` pour
  chaque cas (module non-hôtel, pas de token, token valide, token d'une offre différente injecté dans
  un draft trafiqué).
- **Retest live** (serveur dev réel, recherche `/api/hotels/search-public` réelle, chambre réelle) :
  brouillon légitime → `/booking` et `/booking/checkout` affichent 2 261 TND (950 TND/adulte × 2 ×
  1,19 TVA) ; brouillon avec `unitPriceTnd` falsifié à 1 TND mais `priceToken` réel intact → **toujours
  2 261 TND affiché**, jamais 1 DT ; `priceToken` avec signature corrompue → écran bloqué, 0 montant
  affiché. Voir section 6 pour la preuve détaillée de la construction du token de test.

Cette correction ferme entièrement le finding remonté en section 4 de la version précédente — retiré
de la liste des limitations (voir section 8).

## 3ter. Certification "Dashboard Operations" — cycle CRUD complet, preuve Playwright réelle

Répond à l'exigence explicite : "pas seulement de regarder si les boutons existent" — chaque étape est
un vrai clic navigateur sur une vraie donnée, revérifiée en base par `psql` (rôle superuser, hors RLS)
après coup, jamais une simple présence de composant.

**Méthode** : `e2e/dashboard-operations-hotel-lifecycle.spec.ts` crée une VRAIE réservation hôtel B2C
(myGo virtuel, paiement "Espèces en agence" → statut `pending`), puis, connecté en admin réel
(Supabase/GoTrue, aucun bypass) : recherche par référence dans `/admin/reservations`, valide le
règlement manuel (`VerifyPaymentButton`), modifie le statut depuis la liste (`confirmed → completed`),
rembourse (`RefundButton`, état terminal `refunded`). `e2e/dashboard-operations-permissions-isolation.spec.ts`
réutilise la MÊME référence pour prouver que le compte Pro (agence différente) ne peut ni atteindre le
back-office Admin, ni voir cette réservation dans son propre espace. Résultat détaillé (table au format
`Module | Fonction | Résultat | Real/Mock | UI | API | DB/RLS | Audit | Capture | Limitation`) :
voir `e2e-certification-matrix.md`, section "Dashboard Operations".

**Ordre du cycle** (créer → rechercher → **valider** → **modifier** → **annuler**, plutôt que l'ordre
littéral demandé) : trouvé en écrivant le test, pas supposé à l'avance. `verifyManualPayment` exige
strictement le statut `pending` ; `refunded` (résultat d'"annuler") est un état TERMINAL sans transition
sortante. Modifier le statut AVANT de valider — ou rembourser avant de modifier — bloque définitivement
la suite du cycle. Documenté en tête du fichier de test pour que le prochain cycle sur un autre module
ne reproduise pas la même impasse à l'aveugle.

**Défaut réel trouvé ET corrigé immédiatement** (pas seulement documenté) : le bouton "Vérifier" restait
affiché et cliquable pour un statut `on_request` — qui n'a AUCUN chemin de retour vers `pending` — menant
systématiquement à l'erreur serveur `Impossible de valider un règlement : statut actuel "on_request"
(attendu "pending")`. Exactement le cas "bouton présent mais fonction non câblée" explicitement visé.
Corrigé dans `app/admin/reservations/[id]/page.tsx` : le bouton n'est plus rendu que si
`detail.status === "pending"`. Retesté : le cycle complet passe désormais de bout en bout (13 captures
réelles dans `docs/audits/screenshots/dashboard-ops-*.png`).

**Preuve DB post-cycle** (réservation `TG-2026-001254`, requêtée en superuser) :
```
reservations.status = 'refunded'
payments : cash/deposit (pending, 1502.08 — placeholder initial du checkout) ;
           cash/balance (refunded, tnd_amount=1502.08, refunded_amount=1502.08,
           psp_transaction_id='E2E-CASH-…', refunded_at renseigné)
audit_events (ordre chronologique réel) :
  reservation.created → payment.manual_verified → status_update → payment.refunded
```

**Périmètre couvert vs restant** : ce cycle certifie le module Hôtels Tunisie (myGo) au niveau
"Dashboard Operations" complet. Omraty/Voyages organisés/Attractions ont chacun un flux de réservation
simple déjà prouvé en direct lors d'un cycle antérieur (catalogue → paiement → confirmation → voucher),
mais PAS le cycle CRUD complet (modifier/valider/annuler/permissions/isolation) avec ce niveau de
rigueur — reste à faire, gabarit réutilisable désormais disponible. Vols et Hôtels Monde n'ont aucune
réservation réelle à certifier (`disabled title="… — bientôt disponible"`, confirmé dans le code,
reconfirmé ce cycle, pas une régression) — voir la table "Périmètre réel de réservation par module" dans
`e2e-certification-matrix.md`. Le Virtual MyGo Supplier (fournisseur externe simulé pour Hôtels
Tunisie) était déjà un mock métier réaliste AVANT ce cycle — 14 scénarios (`SOLD_OUT`/`PRICE_CHANGED`/
`TIMEOUT`/`TIMEOUT_AFTER_ACCEPT`/`BOOKING_REJECTED`/`CURRENCY_MISMATCH`/tokens expirés-tamperés/etc.,
`lib/mygo/virtual-supplier/scenarios.ts`), confirmé mais pas reconstruit.

## 4. Trouvailles remontées SANS correction (décision produit requise)

| # | Sujet | Constat | Pourquoi non corrigé automatiquement |
|---|---|---|---|
| 1 | **Création d'agence/tenant** | Bouton "Nouvelle agence" honnêtement désactivé (`disabled title="Pas encore disponible"`) — aucune Server Action, les agences n'existent que via insertion SQL directe | Fonctionnalité complète à construire (formulaire, validation métier, onboarding), pas un bug |
| 2 | **Branding White Label éditable** (logo/nom/domaine) | `brandName`/`logoUrl` sont lus en base et appliqués en runtime (White Label fonctionnel en lecture), mais aucune UI/action ne permet de les éditer — Phase 13 "White Label foundation (minimal)" est bien une fondation lecture-seule | Idem — feature à construire, pas un défaut |

## 5. Tableau de synthèse

| Module | Scénarios testés | PASS | FAIL | Corrigé | Restant (MISSING) | Statut |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| B2C (Hôtel, baseline) | 12 | 12 | 0 | 0 | 0 | 🟢 |
| B2B / Pro | 12 pages + RBAC | 12 | 0 | 0 | 0 | 🟢 |
| Admin | Réservations/clients/staff/agences | Réel | — | 1 (suspend user) | 2 (créer agence, branding) | 🟡 |
| Super Admin | Activation agence, suppliers, staff, users | 4 | 0 | 1 | 2 | 🟡 |
| Hôtels | Recherche/booking/paiement/voucher | Baseline | — | — | — | 🟢 |
| Omra | Catalogue→départ→visa→paiement→voucher | 1 flux complet | 0 | 0 (1 donnée de test ajoutée) | 0 | 🟢 |
| Trips/Packages | Idem + concurrence dernier siège | 1 flux + concurrence | 0 | 0 | 0 | 🟢 |
| Attractions | Idem | 1 flux complet | 0 | 0 | 0 | 🟢 |
| Payments | Webhook idempotent, double capture, refus, partiel | Couverture DB-mode existante | 0 | 0 | 0 | 🟢 |
| Wallet | Débit/crédit, solde insuffisant, idempotence | Couverture DB-mode existante | 0 | 0 | 0 | 🟢 |
| Accounting | Facture, relevé | Existant | 0 | 0 | 0 | 🟢 |
| Voucher | Token opaque, 404 sans/mauvais token | 3 preuves live (hôtel/omra/attraction) | 0 | 0 | 0 | 🟢 |
| Cancellation | FREE/PENALTY/NON_REFUNDABLE | Couverture DB-mode existante | 0 | 0 | 0 | 🟢 |
| CRM | Leads/scoring/inbox/WhatsApp | Couverture DB-mode existante | 0 | 0 | 0 | 🟢 |
| Supplier Hub | 11 scénarios d'erreur MyGo | Couverture existante (driver+virtual supplier) | 0 | 0 | 0 | 🟢 |
| White Label | Isolation cross-tenant (RLS) | Couverture extensive + preuve live | 0 | 0 | 2 (branding, création tenant) | 🟡 |
| Security | ID/prix tampering, session, RBAC | PASS charge / 1 finding affichage | 0 | 0 | 1 (remonté, non corrigé) | 🟡 |
| Frontend | Scan honnêteté (pas de lien mort) | 18 marqueurs honnêtes sur 12 fichiers | 0 | 1 (`/unauthorized`) | reste = features non construites, documentées | 🟢 |
| Production | Garde-fous MYGO_MODE/PAYMENT_MODE | 2 | 0 | 2 | 0 | 🟢 |

## 6. Tests automatisés finaux

```
pnpm tsc --noEmit    → 0 erreur
pnpm lint (eslint .) → 0 erreur (72 warnings pré-existants, aucun nouveau)
pnpm test            → 840/840, 0 échec (828 + 12 nouveaux tests price-token.test.ts)
pnpm build           → succès, 0 erreur (voir section 3bis pour le détail des routes)
```

**Les 2 échecs précédemment observés** (`search-hub.test.ts` catégorie 17, `search-core.test.ts`
démo) sont désormais **prouvés et corrigés** — voir section 3bis.A pour la démonstration complète
(reproduction avec la cause suspectée, test décisif en environnement propre, root cause exacte,
correction dans `scripts/run-tests.mjs`, re-vérification `.env.local` sourcé → 828/828). Ce n'était PAS
un artefact d'ordre d'exécution : l'affirmation du rapport précédent est explicitement rétractée.

**`pnpm build`** → ✅ Compiled successfully, TypeScript OK, toutes les routes générées (dont
`/booking`, `/booking/checkout`, `/api/hotels/search-public` modifiées ce cycle), aucune erreur.

**E2E Playwright** (`e2e/dashboard-operations-hotel-lifecycle.spec.ts` +
`e2e/dashboard-operations-permissions-isolation.spec.ts`, navigateur réel, serveur dev réel, DB réelle)
→ 3/3 passent. Voir section 3ter pour le détail.

## 7. Sécurité — synthèse

- Tenant isolation : prouvée à 3 niveaux (RLS SQL direct, UI cross-agence, tests DB-mode existants
  couvrant wallets/yield_rules/audit_logs/products/CRM/supplier credentials — 15+ scénarios rien que
  pour les credentials fournisseur).
- Prix/montant : jamais dérivé du client, ni à la capture (déjà vrai) ni à l'affichage (corrigé ce
  cycle, section 3bis.B) — le serveur signe (HMAC) le prix au moment de la recherche et le revérifie
  avant tout affichage sur `/booking`, `/booking/checkout` et l'ajout panier ; échec de vérification =
  écran bloqué, jamais un repli silencieux sur une valeur client. Prouvé par tampering live (token
  falsifié → toujours le prix serveur affiché ; signature corrompue → écran bloqué).
- Idempotence paiement : webhook dupliqué, double capture concurrente, wallet debit/credit —
  couverts par tests DB-mode existants.
- Concurrence : dernier siège Trips prouvé en direct (navigateur réel, 2 requêtes simultanées,
  exactement 1 succès) ; dernière chambre hôtel et 10 tentatives simultanées déjà prouvées par test
  DB-mode existant ; Omra/Activités partagent le même pattern `SELECT...FOR UPDATE`.
- Production safety : garde-fous ajoutés et testés (MYGO_MODE/PAYMENT_MODE=virtual refusés si
  NODE_ENV=production).

## 8. Verdict

**🟢 READY WITH KNOWN LIMITATIONS (non-financières)**

La plateforme est fonctionnellement complète et sécurisée sur tous les parcours transactionnels
testés (B2C/B2B/Admin, Hôtels/Omra/Trips/Attractions, paiement/wallet/refund/voucher, isolation
multi-tenant). Aucune faille de sécurité exploitable trouvée. Le seul finding avec une dimension
sécurité/confiance (affichage prix avant paiement) est **corrigé et testé** ce cycle (section 3bis.B).
Un second défaut réel — "bouton présent mais fonction non câblée" (`VerifyPaymentButton` cliquable
dans un état où il échoue systématiquement) — a été trouvé ET corrigé par le cycle "Dashboard
Operations" (section 3ter), qui certifie le module Hôtels Tunisie au niveau CRUD complet
(créer/rechercher/valider/modifier/annuler/DB/audit/permissions/isolation) avec preuve Playwright
réelle. La certification métier OTA complète des 6 verticaux demandée reste un chantier plus large que
ce cycle : Omraty/Voyages organisés/Attractions ont un flux simple déjà prouvé mais pas encore ce
niveau de rigueur CRUD ; Vols/Hôtels Monde n'ont aucune réservation réelle à certifier (confirmé,
honnête, pas une régression).
Les limitations restantes sont toutes des fonctionnalités honnêtement non construites (jamais des
bugs silencieux) :

1. Création d'agence/tenant — à construire.
2. Édition du branding White Label (logo/nom/domaine) — à construire (lecture/runtime déjà réels).

Rien dans cette liste ne bloque une mise en production limitée (marché pilote / lancement contrôlé)
tant que (1) et (2) restent gérés manuellement par l'équipe (SQL direct / support).

**PR #41** : mergeable — 840/840 tests (0 échec, cause des 2 précédents prouvée et corrigée),
0 erreur tsc/lint/build, tampering prix re-testé en direct (bloqué), aucune régression introduite.
