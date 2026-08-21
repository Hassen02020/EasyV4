# EASYV4 — PHASE 11 — AUDIT E2E PRODUCTION + CERTIFICATION MÉTIER

Commit de référence : `12d2c31` (PR #33, mergé dans `main` sous `02e07fb`).
Travail de cette phase effectué sur une nouvelle branche dédiée,
`claude/easy2book-v6-phase11-production-certification`, basée sur `main`
à jour — `main` n'a jamais été modifié directement.

## A. Executive Summary

**READY WITH CONDITIONS — pas pour un lancement B2C grand public autonome,
oui pour un lancement B2B piloté (agences partenaires connues, réservations
hôtel réelles).**

Cette phase a trouvé et corrigé **une vulnérabilité critique (P0) de
manipulation de prix** touchant le pipeline de réservation générique
(`createReservationFromDraft`), et confirmé/corrigé deux failles P1
(voucher émis sans vérification de statut, défense en profondeur
manquante sur l'IDOR voucher). Elle a aussi établi, avec preuves directes
dans le code, deux limites structurelles déjà connues du produit mais dont
l'ampleur réelle n'avait pas été cartographiée aussi précisément :

1. **Il n'existe aujourd'hui aucun parcours B2C autonome qui aboutit à une
   réservation réellement payée.** Chaque pipeline de réservation qui
   débite réellement un wallet (Hôtel, Transfert, Omra, Car) exige une
   session partenaire B2B (`getCurrentPartnerProfile`/`runInTenantContext`)
   — un visiteur anonyme peut chercher, voir des prix réels, obtenir un
   devis réel, mais ne peut jamais payer seul.
2. **Omra et Packages n'ont aucun chemin de réservation réellement
   utilisable en production.** Omra a un moteur serveur solide (wallet +
   facture, transactionnel) mais il n'est monté que sur une page sandbox
   avec des données mockées, sans session. Packages n'a strictement aucun
   moteur de réservation — catalogue en lecture seule, CTA = appel
   téléphonique.

Le module Hôtel (B2C recherche + B2B recherche/booking/wallet/voucher/
facture réel via myGo) est le seul parcours entièrement bout-en-bout
vérifié, avec preuve directe de code et tests, comme réellement prêt.
Transfert et Car ont des moteurs réels et corrects mais partagent la même
limite de session B2B obligatoire.

## B. Module Functional Matrix

| Module | Statut | Preuve principale |
|---|---|---|
| Homepage | PASS | Smoke test 200, ARIA corrigé (voir §J) |
| Vols — recherche/résultats | PASS | Démo honnête vérifiée Phase 10 (`source:"demo"`, 502 si clé configurée mais fournisseur injoignable — jamais de repli silencieux) |
| Vols — booking | PARTIAL (volontaire) | Bouton désactivé en UI, aucun fournisseur réel — conforme à la règle "pas de faux booking" |
| Hôtels Tunisie — recherche/résultats | PASS | E2E golden-path réel (Phase 10) : Home → recherche → `/hotels/search` → résultats visibles |
| Hôtels Tunisie — booking B2B | PASS | myGo `BookingCreation` réel, wallet réel, voucher/facture réels (voir §C, §F) |
| Hôtels Tunisie — booking B2C direct | **FAIL (structurel)** | `createReservationFromDraft` exige une session partenaire — voir Finding critique #2 |
| Hôtels Monde | PASS (démo) | Idem Vols — démo honnête, aucun booking simulé |
| Omra — catalogue | PASS | Prix réels lus depuis `omra_packages`/`omra_allotments` |
| Omra — booking | **FAIL (accessibilité)** | Moteur serveur réel (`createOmraBooking`, wallet+facture atomiques) mais **non branché** à la page catalogue publique ; seul point d'entrée = `/pro/sandbox` avec un package **mocké**, sans session valide — voir Finding critique #3 |
| Packages | **FAIL** | Aucun moteur de réservation du tout — CTA = téléphone |
| Transferts | PASS (moteur), PARTIAL (accès) | `createTransferBooking` réel, `calculateTransferPrice` réel, mais exige une session |
| Car | PASS (moteur), PARTIAL (accès) | `createCarBooking`/`calculateCarPrice` réels (Phase 9-10), même limite de session |
| Login B2B (`/pro/login`) | PASS | 307 vers login avec `next` préservé, vérifié en direct |
| Login B2C | NOT TESTABLE | Aucune session réelle disponible en sandbox ; pas de flux "register" B2C identifié dans le code exploré |
| Wallet (mécanique) | PASS | `FOR UPDATE` + idempotence, désormais testés unitairement (voir §L) |
| Voucher (Hôtel) | PASS (après correction) | Filtre de statut ajouté cette phase — voir Finding P1 #1 |
| Voucher (autres modules) | ABSENT | Aucun mécanisme — la route ne traite que `module==="hotel"` |
| Facture | PASS (Hôtel/Transfert/Omra/Car), ABSENT (Packages) | `generateInvoiceForReservation` appelé dans les 4 pipelines réels |
| Commissions/Markups | PASS (Hôtel/Transfert/Car), **ABSENT (Omra/Packages)** | `pricing_margins` réellement lu et appliqué pour 3 modules sur 5 qui ont un moteur de prix |
| Admin OTA | NOT TESTABLE (majoritairement) | Aucune session admin disponible ; preuve de code uniquement (`admin-gate.ts`, `recharge-actions.ts`) — voir §H |

## C. Corrections effectuées cette phase (avec preuve + test)

### P0 CRITICAL — Prix manipulable côté client sur le pipeline de réservation générique

**TEST** : lecture directe de `lib/booking/actions.ts` (lignes 190-300 avant
correction) et `app/booking/page.tsx::bootstrapDraftFromParams`
(lignes 240-268), croisée avec `lib/booking/schemas.ts:82`
(`unitPriceTnd: z.coerce.number().nonnegative()`).

**RESULT** : confirmé exploitable. `decodeDraft()` lit un token base64url
**non signé** — n'importe quel compte partenaire authentifié
(`partner_owner`/`partner_agent`, seul type de session qui atteint cette
fonction) peut visiter
`/booking?module=flight&offerId=x&offerLabel=y&startDate=2026-09-10&unitPriceTnd=0.001&adults=1`
(ou une URL équivalente pour "hotel" sans métadonnées myGo valides) et
faire aboutir une vraie réservation + un vrai débit wallet au prix qu'il a
lui-même choisi, dès lors que `myGoBooking` (résultat de la confirmation
fournisseur) est `null`.

**EVIDENCE** : `lib/booking/actions.ts:279-292` (avant correction) —
```ts
const breakdown = computePriceBreakdown(
  myGoBooking ? { ...prix myGo margé... } : { unitPriceTnd: draft.unitPriceTnd, ... }
)
```
Le brouillon `draft.unitPriceTnd` est **la seule et unique valeur utilisée**
quand `myGoBooking` est absent — ce qui est le cas pour tout module
autre que `"hotel"`, ET pour `"hotel"` si les métadonnées myGo sont
absentes/invalides.

**CORRECTION** (minimale, ciblée) : ajout d'une garde
`if (!myGoBooking) return { ok: false, error: "..." }` immédiatement après
la tentative de confirmation fournisseur, avant tout calcul de prix.
Vérifié que le seul appelant réellement vivant aujourd'hui
(`app/hotels/search/page.tsx::handleBookHotel`) fournit toujours des
métadonnées myGo valides pour `module: "hotel"` — donc aucune
fonctionnalité réellement utilisée n'est retirée ; seul le chemin
exploitable (forgé ou avec métadonnées incomplètes) est fermé.
Transferts/Omra/Car ne sont pas concernés : ils ont leurs propres actions
dédiées (`createTransferBooking`/`createOmraBooking`/`createCarBooking`)
qui ne passent jamais par cette fonction.

**RISK résiduel** : le test de bout en bout réel (requête forgée → rejet
effectif avant débit) est **NOT TESTABLE** dans ce sandbox (aucune session
Supabase disponible). La garde elle-même est une clause de retour
inconditionnelle, vérifiée par lecture directe et par `pnpm typecheck`/
`pnpm build` réussis ; `createReservationFromDraft` n'a par ailleurs
**aucun harnais de test unitaire** (contrairement à `debitPartnerCredit`)
— construire ce harnais (mock Supabase/session/tenant-context complet)
aurait dépassé le périmètre "correction minimale" de cette phase et n'a
pas été fait. **Recommandation pour la prochaine phase.**

### P1 HIGH — Voucher hôtel généré sans vérifier le statut de la réservation

**TEST** : lecture de `app/api/pro/reservations/[id]/voucher/route.ts`
(avant correction) — la requête ne sélectionnait même pas
`reservations.status`.

**RESULT** : confirmé. Une réservation `pending`, `on_request`,
`cancelled` ou `refunded` produisait un PDF de voucher strictement
identique à celui d'une réservation `confirmed`, dès lors que
`module==="hotel"` et que les champs de séjour étaient renseignés.
Violation directe de l'exigence métier (§7 de la mission) : "un voucher
ne peut PAS être généré pour une réservation échouée ou non payée."

**EVIDENCE** : `app/api/pro/reservations/[id]/voucher/route.ts:86-91`
(avant correction) — condition basée uniquement sur `module`/`hotelName`/
`checkIn`/`checkOut`, aucune référence à `status`.

**CORRECTION** : extraction d'une fonction pure et testable
`isVoucherEligible()` (`lib/pro/voucher-eligibility.ts`) — `module==="hotel"`
**et** `status` ∈ {`confirmed`, `completed`}. Un fichier `route.ts` de
l'App Router ne devant exporter que les handlers HTTP reconnus (vérifié
sur toutes les autres routes du repo), la logique testable est dans un
module `lib/` séparé, importé par la route.

**TEST DE NON-RÉGRESSION** : `lib/pro/__tests__/voucher-eligibility.test.ts`
— 8 cas (confirmé/completed → true ; pending/on_request/cancelled/refunded
→ false ; module non-hôtel → false ; données de séjour incomplètes →
false). **265/265 tests passent** au total après cette correction.

### P1/P2 — Défense en profondeur manquante sur la route voucher (IDOR potentiel)

**TEST** : la requête SQL de la route voucher filtrait uniquement par
`reservations.id`, en s'appuyant **exclusivement** sur RLS
(`withTenantContext`) pour l'isolation d'agence — contrairement à
`lib/pro/reservation-detail.ts::loadReservationByRef`, qui filtre
explicitement `agencyId` **en plus** de RLS.

**RESULT** : dans les conditions normales (RLS actif, rôle `DATABASE_URL`
sans `BYPASSRLS`), aucune fuite possible — confirmé par lecture des
policies (`agency_id = current_agency_id() OR is_super_admin()`,
`drizzle/manual/0001_rls_policies.sql`). Le risque n'existe que si RLS
était un jour contourné (mauvaise configuration du rôle DB).

**CORRECTION** : ajout du filtre explicite
`and(eq(reservations.id, reservationId), eq(reservations.agencyId, profile.agency.id))`
— défense en profondeur, même pattern que `reservation-detail.ts`. Aucun
changement de comportement pour un usage normal (RLS filtre déjà la même
chose), coût nul.

**RISK résiduel** : impossible de vérifier depuis ce repo si le rôle
`DATABASE_URL` de production a `BYPASSRLS`/`rolsuper` — précondition dont
dépend TOUTE la RLS de l'application (documentée dans
`drizzle/manual/0012_rls_session_context.sql:166-198` avec la requête de
vérification `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE
rolname = current_user;`). **NOT TESTABLE depuis ce sandbox — à vérifier
manuellement sur la base réelle.**

## D. Findings documentés, non corrigés (hors périmètre "correction sûre et limitée")

### CRITIQUE #2 — Aucun parcours B2C autonome ne peut réellement payer

Tous les pipelines qui débitent un wallet réel
(`createReservationFromDraft`, `createTransferBooking`,
`createOmraBooking`, `createCarBooking`) résolvent l'identité via une
session partenaire B2B authentifiée. Il n'existe pas de mécanisme
équivalent pour un client B2C individuel (pas de "wallet client", pas de
paiement carte/PSP direct câblé à un de ces pipelines dans le code
exploré). C'est un **changement d'architecture**, pas un bug local — non
corrigé, documenté comme risque produit majeur pour toute annonce "B2C
opérationnel".

### CRITIQUE #3 — Omra : moteur réel mais inatteignable en production

`lib/omra/booking-actions.ts::createOmraBooking` (audité cette phase par
agent, lignes 136-465) est un pipeline transactionnel complet et correct :
`SELECT ... FOR UPDATE` sur `omraAllotments`, débit wallet dans la même
transaction que la création de réservation, facture générée après commit.
Mais son seul appelant, `OmraBookingForm`, n'est monté que sur
`app/pro/sandbox/page.tsx` avec un package **mocké**
(`MOCK_OMRA_PACKAGE`) et sans session valide — la page catalogue publique
`/omra/[id]` ne propose aucun CTA de réservation (redirection téléphone).
**Corriger ceci nécessiterait de construire un vrai parcours voyageurs +
paiement, une fonctionnalité substantielle** — hors périmètre "correction
P0-P2 sûre et limitée" de cette phase. Documenté, non implémenté.

### MAJEUR — Packages : aucun moteur de réservation

Confirmé par audit direct : aucun fichier `createPackageBooking` nulle
part dans `lib/`. Le commentaire du code lui-même le dit explicitement
(`app/packages/[slug]/page.tsx:9-14`). Catalogue en lecture seule, prix
réels affichés mais jamais utilisés dans un calcul de commande. Non
implémenté — construire ce moteur serait un chantier de la taille d'Omra
ou de Transferts, hors périmètre de cette phase.

### MAJEUR — Tables Omra sans RLS (finding préexistant, toujours ouvert)

`omra_packages`, `omra_allotments`, `omra_flights`,
`omra_room_allocations` n'ont jamais eu de RLS activé — **déjà documenté
comme finding résiduel non résolu** dans
`drizzle/manual/0017_omra_pilgrims_rls.sql:17-28` (audit d'une phase
antérieure, retrouvé indépendamment par l'agent de cette phase). Corriger
nécessiterait une nouvelle migration RLS — explicitement hors périmètre de
cette phase ("NE PAS créer de migration"). Toujours ouvert.

### MOYEN (P2, non corrigé) — Idempotence wallet dépendante de Redis sans repli

`debitPartnerCredit` ne déduplique une requête rejouée
(`idempotencyKey`) que si Redis (Upstash) est configuré — `getRedis()`
retourne `null` sinon et la protection est **silencieusement inactive**
(chaque appel réexécute le débit ; le verrou `FOR UPDATE` protège la vraie
concurrence mais pas un retry séquentiel après coup). `UPSTASH_REDIS_REST_URL`/
`_TOKEN` sont documentées dans `.env.example` mais **impossible de
vérifier depuis ce repo si elles sont réellement configurées sur le
déploiement Vercel de production — NOT TESTABLE**. Un `redisOverride`
testable a été ajouté (voir §L) et le comportement Redis-présent est
désormais couvert par un test ; le repli "pas de Redis = pas de dédup" n'a
volontairement pas été modifié (implémenter une dédup DB-level serait un
changement de schéma, hors périmètre). **Recommandation** : vérifier les
variables Upstash en production.

## E. Sécurité — synthèse (audit complet en arrière-plan cette phase)

Audit exhaustif des policies RLS (`drizzle/manual/0001-0020_*.sql`),
fonctions de contexte SQL, Server Actions, et IDOR — méthode : lecture
directe, pas de supposition.

- **`current_agency_id()`/`is_super_admin()`** : fonctions correctes,
  posées uniquement côté serveur via `set_config` (jamais depuis une
  entrée client) — `lib/db/tenant-context.ts:47-78` confirmé.
- **`set_agency_deposit_balance()`** (`SECURITY DEFINER`) : re-vérifie en
  interne que l'appelant agit sur sa propre agence — pas d'escalade de
  privilège possible même en bypass RLS interne.
- **Anciennes policies `USING(true)`** trouvées sur `wallets`/
  `wallet_transactions` (0006) : **déjà corrigées** (`DROP`ées en 0012,
  avec commentaire du repo reconnaissant "une porte dérobée
  involontaire"). Dette historique éteinte.
- **`is_super_admin()` v1** (dépendant de `auth.uid()`, toujours `FALSE`
  en connexion directe postgres-js) : **déjà corrigée** en v2 (0012).
- **`wallet_recharge_requests`/`omra_pilgrims`** : gaps RLS critiques
  trouvés et **déjà corrigés** dans des phases antérieures (0015, 0017).
- Aucune route API trouvée acceptant un `agencyId` client dans le corps
  de requête. `app/api/payment/webhook/route.ts` : signature HMAC
  vérifiée, montant/devise revérifiés côté serveur — correct.
- Le finding P0 §C (prix client-contrôlé) était la seule faille
  financière directe non déjà corrigée trouvée par cet audit.

**Non vérifiable depuis ce repo** : le rôle Postgres réel de
`DATABASE_URL` en production a-t-il `BYPASSRLS`/`rolsuper` ? Toute la RLS
en dépend. **NOT TESTABLE.**

## F. Chaîne de cohérence des données (Hôtel B2B — seul parcours entièrement vérifiable)

`User → Customer → Booking → Wallet Transaction → Supplier (myGo) →
Voucher → Invoice` — vérifié sans étape orpheline pour le module Hôtel :
`createReservationFromDraft` crée `customers`+`reservations`+
`reservationHotel` et débite le wallet **dans la même transaction**
(`txOverride`), marque `confirmed` uniquement après succès du débit,
génère la facture après commit (échec de facturation n'invalide jamais la
réservation déjà payée), voucher généré à la demande et maintenant gated
sur le statut réel. Transferts/Car suivent exactement le même pattern
(vérifié par lecture directe de leurs `actions.ts` respectifs, Phase 9-10).

## G. Race conditions / concurrence

**NOT TESTABLE en direct** — `scripts/wallet-race-test.ts` (5 débits
simultanés simulés, vérifie l'absence de race condition sur
`agencies.deposit_balance`) exige `DATABASE_URL` et sort en erreur
explicite sans (vérifié : `process.exit(1)` si absent). Aucune base
Postgres réelle disponible dans ce sandbox.

**Preuve statique en substitut** : `debitPartnerCredit` utilise
`SELECT ... FOR UPDATE` à l'intérieur d'une transaction Drizzle — toute
transaction concurrente qui tente de lire/écrire la même ligne `agencies`
attend le `COMMIT`/`ROLLBACK` de la première (`lib/pro/booking-actions.ts:242-267`,
commentaire détaillé du mécanisme). C'est le design correct pour
éliminer un double-spending — non exécuté en conditions réelles cette
phase, mais le mécanisme lui-même est désormais couvert par des tests
unitaires (succès, solde insuffisant, agence introuvable, **idempotence**
— nouveau cette phase, voir §L).

## H. Admin OTA

**Majoritairement NOT TESTABLE** — aucune session admin disponible dans ce
sandbox. Preuve de code uniquement :
- `lib/auth/admin-gate.ts::isAllowedIntoAdmin` : exige rôle staff **et**
  `agency_type==='ota'` — corrige un bug historique documenté où un
  `manager` d'agence partenaire pouvait entrer dans `/admin`.
- `lib/finance/recharge-actions.ts::assertSuperAdminSession` : vérifie
  `session.isSuperAdmin` avant validation/refus d'une recharge.
- "Inviter un agent" (gestion des Partner Agents par un Owner) est
  actuellement un **mock frontend sans écriture DB** — le contrôle de
  rôle (`canManagePartnerUsers`) est bien appliqué côté page, mais rien
  n'est réellement persisté aujourd'hui ; à revérifier le jour où
  l'invitation sera branchée en vrai.

## I. Erreurs / dégradation

Vérifié pour le chemin wallet : aucune fuite de stack trace
(`err instanceof Error ? err.message : "..."`, jamais `err.stack`),
aucune écriture partielle en cas d'échec (transaction unique, rollback
complet). Vérifié pour Vols/Hôtels Monde : fournisseur injoignable →
`502` explicite, jamais de repli silencieux vers une fausse
disponibilité (testé en direct cette session avec clé factice + endpoint
invalide, voir rapport Phase 10). Wallet insuffisant → `INSUFFICIENT_FUNDS`
propre, testé unitairement.

## J. Mobile/UI

Non ré-audité en profondeur cette phase (déjà fait Phase 10 :
`e2e/mobile-overflow.spec.ts`, 20/20 sans débordement horizontal à 390px/
1440px sur les 7 modules). Correction UI de cette phase limitée aux rôles
ARIA cassés trouvés lors de la QA Phase 10 (déjà committée avant cette
phase) — rien de nouveau touché ici, conformément à la consigne "pas de
refonte graphique".

## K. Performance

Non ré-auditée en profondeur cette phase (déjà fait Phase 10 : garde
`requestKey` anti-double-fetch sur Vols/Hôtels Monde/Hôtels Tunisie,
aucune image brute non lazy dans le code ajouté). Aucun changement de
cette phase n'introduit de nouvel appel réseau/DB répété.

## L. Tests

- **Ajoutés cette phase** :
  - `lib/pro/__tests__/voucher-eligibility.test.ts` (8 tests) — couvre le
    correctif P1 voucher.
  - `lib/pro/__tests__/booking-actions.test.ts` : +2 tests idempotence
    (résultat caché retourné sans réexécuter le débit ; deux clés
    distinctes débitent bien deux fois) — comblent un gap réel : la
    protection d'idempotence (documentée, implémentée) n'avait **aucune**
    couverture de test avant cette phase.
- **Résultat** : **265/265 tests unitaires passent** (255 avant cette
  phase + 10 nouveaux).
- **Tests existants** : aucun supprimé ni modifié dans leur intention,
  uniquement étendus.
- **NOT TESTABLE** : `scripts/wallet-race-test.ts` (concurrence réelle),
  `e2e/auth.spec.ts` et `e2e/booking-flow.spec.ts` (nécessitent une vraie
  session Supabase / des données "offres flash" en base) — limitations déjà
  documentées Phase 10, confirmées inchangées cette phase (pas de
  `DATABASE_URL` dans ce sandbox).
- **E2E rejoués** : `e2e/hotel-search.spec.ts` non rejoué cette phase
  (aucun changement de code touchant ce parcours) — dernière exécution
  connue (Phase 10) : PASS.

## M. Build

`pnpm typecheck` / `pnpm lint` (0 erreur, 119 warnings — baseline
inchangée) / `pnpm test` (265/265) / `pnpm build` : tous **PASS** sur le
commit final de cette phase. `pnpm start` (build production réel)
démarré et sondé en direct — toutes les routes B2C/B2B testées répondent
200 ou une redirection 307 correcte (voir §N).

## N. Smoke test production (build local, `pnpm start`)

*(Le sandbox ne peut pas atteindre `*.vercel.app` — `EGRESS_BLOCKED`
confirmé la phase précédente ; ceci n'est pas traité comme un bug
applicatif, conformément à la consigne. Build local identique au commit
validé utilisé à la place.)*

| Route | Statut | Note |
|---|---|---|
| `/` | 200 | |
| `/vols`, `/vols/search?...` | 200 | Démo honnête |
| `/hotels/search?...` | 200 | |
| `/hotels-monde`, `/hotels-monde/search?...` | 200 | Démo honnête |
| `/omra`, `/packages`, `/transferts`, `/car` | 200 | |
| `/booking` (sans draft) | 200 (redirect interne App Router vers `/`) | |
| `/pro/login` | 200 | |
| `/pro/hotels`, `/pro/hotels/[id]` (sans session) | 307 → `/pro/login?next=...` | `next` préservé, vérifié |

**Aucun secret dans le bundle client** : grep ciblé sur
`.next/static/chunks/` pour `DATABASE_URL`, `SUPABASE_SERVICE_ROLE`,
`MYGO_API_KEY`/`_SECRET`, `FLIGHTS_API_KEY`, `WORLD_HOTELS_API_KEY`,
`UPSTASH_REDIS_REST_TOKEN` — aucune occurrence.

## O. Git / Déploiement

```
git status               → clean avant modification
git log -1 --oneline     → 02e07fb (main, avant création de branche)
git branch --show-current → claude/easy2book-v6-phase11-production-certification
```

6 fichiers modifiés/ajoutés (voir `git diff --stat` ci-dessous), tous
strictement liés aux 3 corrections de sécurité/correction P0-P1 de cette
phase :

```
app/api/pro/reservations/[id]/voucher/route.ts |  31 +++++--
lib/booking/actions.ts                         |  65 ++++++++++-----
lib/pro/__tests__/booking-actions.test.ts      | 109 +++++++++++++++++++++++
lib/pro/__tests__/voucher-eligibility.test.ts  |  (nouveau)
lib/pro/booking-actions.ts                     |  23 +++++-
lib/pro/voucher-eligibility.ts                 |  (nouveau)
```

`main` n'a pas été modifié directement. Le travail est commité sur la
branche dédiée ci-dessus et **poussé** — voir confirmation en fin de
session. PR à ouvrir manuellement si souhaité (permissions GitHub
disponibles dans cet environnement le permettent, mais l'ouverture de PR
n'est faite que si explicitement demandée).

## Functional Score

| Domaine | Score | Justification |
|---|---|---|
| B2C | 45/100 | Recherche/affichage réels et honnêtes partout ; **aucun paiement B2C autonome possible** |
| B2B | 70/100 | Hôtel/Transfert/Car réels et corrects ; Omra inatteignable ; gestion agents = mock |
| Admin | 40/100 | Preuve de code correcte mais majoritairement NOT TESTABLE ce sandbox |
| Hotels (Tunisie) | 90/100 | Seul parcours entièrement vérifié bout-en-bout, P0 corrigé |
| Flights | 60/100 | Honnête et sans faille, mais aucune réservation réelle possible (assumé, pas un bug) |
| Omra | 35/100 | Moteur serveur solide, **zéro accès public réel** |
| Packages | 10/100 | Catalogue seul, aucun moteur de réservation |
| Transfers | 75/100 | Moteur réel correct, limité par la session B2B obligatoire |
| Car | 75/100 | Idem Transferts |
| Wallet | 85/100 | Atomique, verrou correct, idempotence désormais testée ; dépendance Redis non garantie en prod |
| Payments | 60/100 | Webhook PSP correct (audité) ; **faille prix P0 corrigée** cette phase |
| Security | 75/100 | RLS globalement solide et déjà durci sur plusieurs phases ; faille P0 prix trouvée et corrigée ; RLS Omra toujours ouvert (déjà connu) ; BYPASSRLS non vérifiable |
| UX | Non ré-évalué cette phase | Voir rapport Phase 10 (mobile/a11y déjà audités et corrigés) |

## Production Readiness

**YELLOW.**

- **GREEN** : Hôtels Tunisie B2B (recherche → booking → wallet → voucher
  → facture), sécurité RLS de fond, mécanique wallet.
- **YELLOW** : Transferts/Car (moteurs corrects mais accès B2C bloqué),
  Vols/Hôtels Monde (honnêtes, sans faille, mais sans fonctionnalité de
  réservation).
- **RED** : Omra (moteur inatteignable en production), Packages (aucun
  moteur), tout parcours B2C autonome payant.

## Remaining Risks (réels uniquement)

1. Aucun parcours B2C ne peut aboutir à un paiement sans compte
   partenaire — décision produit à trancher, pas un bug local.
2. Omra : moteur réel mais jamais exposé publiquement — nécessite un
   vrai front B2C (formulaire voyageurs + paiement), chantier de la
   taille de la phase 9.
3. Packages : aucun moteur de réservation à construire.
4. RLS jamais activé sur 4 tables Omra (`omra_packages`,
   `omra_allotments`, `omra_flights`, `omra_room_allocations`) — nécessite
   une nouvelle migration, hors périmètre de cette phase.
5. Impossible de confirmer depuis ce repo que le rôle `DATABASE_URL` de
   production n'a pas `BYPASSRLS` — précondition dont dépend toute la RLS.
6. Impossible de confirmer que `UPSTASH_REDIS_REST_URL`/`_TOKEN` sont
   réellement configurées en production — sans elles, la dédup
   d'idempotence wallet est silencieusement inactive.
7. `createReservationFromDraft` reste sans harnais de test unitaire
   propre (le correctif P0 est vérifié par lecture directe + les gates
   globales, pas par un test dédié à la fonction elle-même).
8. Race conditions réelles (multi-transactions Postgres concurrentes) non
   exécutées cette phase — script dédié existant (`wallet-race-test.ts`)
   mais nécessite une vraie base.
