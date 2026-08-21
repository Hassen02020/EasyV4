# EASYV4 — PHASE 9 — B2B HOTEL BOOKING BRIDGE — AUDIT + IMPLÉMENTATION

Objectif : terminer le parcours B2B hôtel `/pro/hotels → hotel → rooms → rate
→ revalidation → BookingCreation → wallet → voucher → confirmation`, en
réutilisant l'existant sans dupliquer aucun mécanisme (BookingCreation,
wallet debit, revalidation, marge, voucher). Les audits Phase 7/8 (moteur de
recherche, dédup, best rate, filtres, facettes, tri, isolation tenant) ne
sont pas repris ici — voir `EASYV4_HOTELS_RESULTS_PHASE7_REPORT.md` et
`EASYV4_B2B_HOTELS_PHASE8_REPORT.md`.

## 1. Architecture de réservation existante

Le pipeline de réservation hôtel réel existait déjà et n'a pas été recréé :

- `lib/booking/actions.ts::createReservationFromDraft()` — pipeline unique :
  résout `agencyId` via `getCurrentPartnerProfile(user.id)` (jamais codé en
  dur), appelle `confirmHotelWithProvider()` **avant** toute écriture DB,
  ouvre une transaction `withTenantContext` qui crée
  `customers`/`reservations`/`reservationHotel`/`auditEvents`, débite le
  wallet dans la **même** transaction (`txOverride`), marque la réservation
  `confirmed`, insère `payments`, puis (hors transaction) émet l'événement
  Inngest `booking/confirmed` et génère la facture.
- `lib/booking/actions.ts::confirmHotelWithProvider()` — appelle
  `getMyGoClient().createBooking()` avant toute écriture DB/wallet ; c'est
  cet appel qui fait office de revalidation autoritaire finale (myGo
  vérifie prix/disponibilité à cet instant précis).
- `lib/booking/hotel-provider-booking.ts` — logique pure et déjà testée :
  extraction/validation des métadonnées fournisseur
  (`hotelProviderMetadataSchema`), construction de la requête
  `BookingCreation`, dérivation du prix unitaire autoritaire depuis le
  `totalPrice` réel myGo (jamais depuis une valeur envoyée par le client),
  classification des erreurs (`PRICE_CHANGED`, `NO_AVAILABILITY`,
  `AMBIGUOUS_SUPPLIER_STATE`…), réconciliation en lecture seule pour les cas
  ambigus (timeout réseau).
- `lib/pro/booking-actions.ts::debitPartnerCredit()` — débit wallet réel :
  verrou pessimiste `SELECT...FOR UPDATE` sur `agencies`, vérification de
  solde, écriture `partner_credit_movements`, écriture du solde via la
  fonction SQL `SECURITY DEFINER` `set_agency_deposit_balance()` (seul canal
  compatible RLS), idempotence via clé Redis 24h.
- `app/pro/(app)/booking/confirmation/[ref]/page.tsx` +
  `lib/pro/reservation-detail.ts::loadReservationByRef()` — page de
  confirmation déjà branchée sur les données réelles, scopée tenant.
- `app/api/pro/reservations/[id]/voucher/route.ts` — génération de voucher
  PDF à la demande à partir des données de réservation stockées, déjà
  scopée tenant, déjà générique.

Aucun de ces mécanismes n'a été modifié en profondeur ; ils étaient corrects
mais **jamais réellement atteints** par le B2B (voir §2).

## 2. Écart trouvé (point de rupture réel)

Le formulaire B2B existant (`components/pro/booking-travelers-form.tsx`,
utilisé par l'ancien chemin fixture `/pro/hotels/[id]` →
`lib/pro/hotels-fixture.ts`) appelait déjà `createReservationFromDraft` —
donc le pipeline réel était bien invoqué. Mais son `draft.metadata` était
construit comme `{hotelId: context.hotel.id (une chaîne de fixture),
internalRef, matricule, coupon, paymentMode, offers: [...]}`, qui ne
correspond pas au schéma `hotelProviderMetadataSchema` attendu
(`myGoToken, cityId, hotelId (number), boardingId, roomId, ...`).

Conséquence concrète : `extractHotelProviderMetadata()` retournait `null`,
`confirmHotelWithProvider()` retournait `{attempted: false}` (aucun appel
myGo), et le flux continuait quand même jusqu'au débit wallet réel — pour un
hôtel **jamais confirmé auprès du fournisseur**, avec
`reservationHotel.hotelId` stocké comme `Number("carthage-thalasso") || 0`
= `0`. C'est pire qu'un simple blocage : la réservation "réussissait"
silencieusement en étant fictive côté fournisseur, tout en débitant
réellement le wallet de l'agence.

Ce n'est pas un bug du pipeline lui-même : c'est l'ancien pont B2B
(fixture) qui n'alimentait jamais les métadonnées attendues. Le pipeline
`createReservationFromDraft`/`confirmHotelWithProvider` était donc
architecturalement prêt ; il manquait uniquement un chemin B2B qui lui
fournisse les bonnes données, issues de vraies offres myGo (Phase 8).

## 3. Composants réutilisés (sans duplication)

- `runHotelSearch()` (`lib/mygo/search-core.ts`, Phase 8) — réutilisé tel
  quel, scopé à un seul hôtel via `HotelSearchInput.hotelId` (déjà supporté
  par le connecteur myGo, non nouveau).
- `applyMarginToHotelOffer()` (`lib/pro/pricing.ts`, Phase 8) — réutilisé
  tel quel pour l'affichage des prix agence sur la page détail/chambres et
  la page voyageurs.
- `applyMargin()` + `getMarginsForAgency()` — réutilisés tels quels (voir
  §6, seule modification nécessaire du pipeline).
- `createReservationFromDraft()`, `confirmHotelWithProvider()`,
  `hotel-provider-booking.ts` (schémas, construction requête,
  classification d'erreurs, réconciliation) — utilisés **sans aucune
  modification**.
- `debitPartnerCredit()` — utilisé sans aucune modification.
- Page de confirmation, `loadReservationByRef`, route voucher — réutilisées
  sans modification (un lien de téléchargement a été ajouté sur la page,
  voir §11).
- `bookingDraftSchema`/`travelerSchemaWithIdRule` (`lib/booking/schemas.ts`)
  — réutilisés tels quels pour construire le `BookingDraft` du nouveau
  formulaire.

Aucun deuxième `BookingCreation`, aucun deuxième débit wallet, aucune
deuxième formule de marge, aucun deuxième moteur de voucher n'a été créé.

## 4. Pont B2B — nouveaux fichiers

Chemin ajouté, strictement scopé à `/pro/hotels/[id]` et
`/pro/booking/travelers` :

- `app/pro/(app)/hotels/[id]/page.tsx` (réécrit) — remplace le fixture par
  `runHotelSearch()` scopé à l'hôtel, applique la marge, affiche
  `ProRoomSelector`. L'ancien fixture (`lib/pro/hotels-fixture.ts`,
  `getProHotelById`) n'a été ni supprimé ni modifié — simplement laissé
  orphelin de cette page.
- `components/pro/pro-room-selector.tsx` (nouveau) — liste chambre × pension
  à partir du DTO myGo réel, une seule chambre sélectionnable par
  réservation (même granularité que `hotel-listings.tsx::handleBookHotel`
  côté B2C — myGo supporte le multi-chambre côté `CreateBookingInput.rooms[]`,
  mais aucun flux de l'app ne l'implémente ; non inventé ici). Pousse vers
  `/pro/booking/travelers` avec `myGoToken`, `boardingId`, `roomId`, etc.
- `app/pro/(app)/booking/travelers/page.tsx` (réécrit, **branché, pas
  remplacé**) — la présence de `search.myGoToken` distingue le nouveau
  chemin myGo réel de l'ancien chemin fixture (`search.offers`), qui reste
  intact et joignable pour compatibilité descendante. Sur le chemin réel :
  re-recherche l'hôtel (revalidation, voir §5), retrouve la chambre exacte
  via `matchSelectedRoom()` (§13), applique la marge, affiche
  `ProBookingTravelersForm`.
- `components/pro/pro-booking-travelers-form.tsx` (nouveau) — construit un
  `BookingDraft` avec les métadonnées **exactes** attendues par
  `hotelProviderMetadataSchema`, puis appelle `createReservationFromDraft`
  sans aucune modification. C'est la correction du point de rupture du §2.
- `lib/booking/room-match.ts` (nouveau, pur) — extrait la logique de
  sélection chambre/pension pour la rendre testable (§13).

## 5. Revalidation

Aucun mécanisme de revalidation séparé n'existait ni n'a été inventé. Deux
niveaux, tous deux réutilisant l'existant :

1. **Revalidation "douce"** : `runHotelSearch()` est ré-exécuté à deux
   reprises avec les mêmes filtres (ville/dates/adultes/hôtel) — une fois
   sur la page détail (sélection de chambre), une fois sur la page
   voyageurs (juste avant affichage du formulaire final). Si la chambre
   choisie n'existe plus ou est passée `stopReservation`,
   `matchSelectedRoom()` retourne `null` et l'utilisateur voit un état
   "Cette chambre n'est plus disponible" avec un lien pour recommencer —
   aucune réservation n'est tentée sur des données périmées.
2. **Revalidation autoritaire finale** : l'appel `getMyGoClient().createBooking()`
   dans `confirmHotelWithProvider()` (inchangé) — myGo revérifie
   prix/disponibilité/chambre/pension à l'instant T et peut rejeter
   (`PRICE_CHANGED`, `NO_AVAILABILITY`) avant toute écriture DB/wallet.

Limite honnête : l'architecture actuelle ne propose **pas** de flux "prix a
changé → afficher l'écart → demander confirmation explicite avant débit" —
`confirmHotelWithProvider` échoue simplement avec une erreur classifiée et
aucune réservation n'est créée (rollback complet, rien n'est débité).
Ajouter un flux de confirmation de changement de prix nécessiterait un
état intermédiaire (pré-réservation en attente) qui n'existe pas dans le
pipeline actuel ; ce serait un changement d'architecture du pipeline de
réservation, explicitement hors du périmètre "réutiliser sans recréer" de
cette phase. Documenté ici comme décision à prendre séparément si le métier
le souhaite — non implémenté.

## 6. Pricing / marge — bug lié au pont corrigé

`authoritativeUnitPrice(myGoBooking.totalPrice, draft.adults)` utilisait le
prix **net fournisseur** myGo directement, sans marge — parce qu'avant
cette phase, ce chemin n'était jamais atteint avec de vraies métadonnées
myGo (voir §2), la question ne s'était jamais posée en pratique.

En branchant réellement le B2B sur ce pipeline,
`createReservationFromDraft` n'est atteignable qu'avec une session résolue
par `getCurrentPartnerProfile` (agence `agency_type = 'partner'` par
construction, confirmé en lisant `lib/auth/partner-profile.ts` — aucune
autre voie n'existe vers cette action). Le montant réellement débité au
wallet de l'agence doit donc toujours être le **prix agence** (marge
appliquée), jamais le prix net — sinon toute réservation hôtel B2B
réellement confirmée aurait débité l'agence au prix fournisseur brut, sans
aucune marge, ce qui casse le modèle économique.

C'est un bug directement lié au nouveau pont (exception explicitement
permise par la mission), corrigé au minimum dans
`lib/booking/actions.ts` :

```ts
const agencyHotelPrice = myGoBooking
  ? applyMargin(myGoBooking.totalPrice, (await getMarginsForAgency(agencyId, authUserId)).hotel)
  : null

const breakdown = computePriceBreakdown(
  myGoBooking
    ? { ...authoritativeUnitPrice(agencyHotelPrice ?? myGoBooking.totalPrice, draft.adults), ... }
    : { ... },
)
```

`applyMargin` et `getMarginsForAgency` sont réutilisés tels quels — aucune
deuxième formule de marge n'a été créée. Le prix affiché au front (page
chambres, page voyageurs) et le prix effectivement débité au wallet
proviennent désormais tous deux du même calcul de marge sur le même prix
fournisseur revalidé — le frontend ne décide jamais du prix final, il
l'affiche seulement.

## 7. Wallet

Non modifié. `debitPartnerCredit()` est appelé exactement comme avant, dans
la même transaction que la création de la réservation, avec la même clé
d'idempotence `booking-debit:${reservationId}`. Le débit ne peut se
produire qu'après le succès de `confirmHotelWithProvider()` (le pipeline
échoue et rollback avant toute écriture DB si la confirmation fournisseur
échoue) — comportement hérité inchangé, désormais réellement exercé par le
B2B.

## 8. Sécurité

- Identité agence : `agencyId` résolu uniquement via
  `getCurrentPartnerProfile(user.id)` côté serveur — jamais transmis par le
  client, jamais dans l'URL ou le `BookingDraft`.
- Isolation tenant : `runHotelSearch`, `getActivePartnerMargins`,
  `createReservationFromDraft` (transaction `withTenantContext`),
  `loadReservationByRef` et la route voucher sont tous scopés
  `agencyId` — une agence ne peut ni réserver au nom d'une autre, ni lire
  la réservation/le voucher d'une autre.
- Prix/marge : jamais modifiables par le client — `priceTnd` affiché au
  formulaire voyageurs est indicatif seulement ; le montant réellement
  débité est recalculé côté serveur dans `createReservationFromDraft`
  depuis le `totalPrice` myGo revalidé + la marge de l'agence courante
  (§6). Le `BookingDraft.unitPriceTnd` envoyé par le client n'est utilisé
  que si `confirmHotelWithProvider` échoue à s'exécuter (`attempted:
  false`) — comportement hérité inchangé, non modifié par cette phase.
- Rate d'un autre contexte : `matchSelectedRoom()` (§13) empêche toute
  substitution silencieuse — si le `boardingId`/`roomId` transmis par
  l'URL ne correspond plus exactement à une chambre disponible de la
  re-recherche, la sélection est rejetée (`null`), jamais remplacée par une
  autre chambre.
- Aucune donnée interne (marge en valeur absolue, coût net fournisseur)
  n'est affichée côté formulaire voyageurs — seul le "Total (prix agence)"
  est montré.

## 9. Idempotence

Non modifiée — héritée de `debitPartnerCredit()`
(`idempotencyKey: booking-debit:${reservationId}`, clé Redis 24h) et de la
transaction unique DB qui crée `reservations`/`reservationHotel`/débite le
wallet ensemble. Un double-clic sur "Confirmer la réservation" déclenche
`useTransition` côté client (bouton désactivé pendant `pending`), et même
en cas de contournement (double soumission réseau), le pipeline
`createReservationFromDraft` inchangé reste protégé par les mêmes garanties
qu'avant cette phase.

## 10. Tests

Gates exécutés sur l'ensemble des fichiers touchés/nouveaux :
`pnpm typecheck` (clean), `pnpm lint` (0 erreur — un `react/no-children-prop`
a été trouvé et corrigé en renommant la prop `children` → `childrenCount`
dans `ProBookingTravelersForm`), `pnpm test` (245/245 tests passent, 5
nouveaux), `pnpm build` (succès, toutes les routes se génèrent, y compris
`/pro/hotels/[id]` et `/pro/booking/travelers`).

Nouveaux tests unitaires (`lib/booking/__tests__/room-match.test.ts`) pour
`matchSelectedRoom()` — la logique de sélection/revalidation de chambre
extraite en fonction pure (§4) :
- retrouve la chambre exacte par `boardingId` + `roomId` ;
- ne confond pas deux pensions différentes partageant le même `roomId` ;
- rejette (`null`) une chambre passée `stopReservation` depuis la
  re-recherche ;
- rejette (`null`) un `boardingId` ou `roomId` qui n'existe plus.

La correction de marge (§6) n'a pas reçu de test dédié : elle compose deux
fonctions déjà exhaustivement testées (`applyMargin` — percent/fixed/
inactive/arrondi, `authoritativeUnitPrice` — déjà testé dans
`hotel-provider-booking.test.ts`) en une seule ligne ; dupliquer ce test
aurait été une redondance sans valeur ajoutée par rapport à la couverture
déjà existante des deux fonctions.

## 11. Limites production (sandbox)

Conformément à la mission : aucun booking réel n'a été prétendu testé.
Aucune session Supabase authentifiée n'est disponible dans ce sandbox — les
routes `/pro/hotels/[id]` et `/pro/booking/travelers` ont été vérifiées
en curl non authentifié, confirmant qu'elles redirigent correctement vers
`/pro/login?next=...` (même comportement que toutes les autres routes
`/pro/*` protégées), ce qui valide le câblage des routes sans valider le
parcours de réservation lui-même.

Ce qui reste à valider avec une vraie session partenaire + connexion myGo
réelle : le clic bout-en-bout `/pro/hotels` → sélection chambre →
formulaire voyageurs → `createReservationFromDraft` → débit wallet réel →
page de confirmation → téléchargement du voucher ; les cas d'échec
fournisseur réels (`PRICE_CHANGED`, `NO_AVAILABILITY`, timeout) ; le
comportement du wallet en cas de solde insuffisant sur ce chemin précis.
Ces mécanismes eux-mêmes (pipeline, débit, classification d'erreurs) sont
inchangés depuis avant cette phase et déjà couverts par les tests
unitaires/intégration existants de `lib/booking/hotel-provider-booking.ts`
et `lib/pro/__tests__/booking-actions.test.ts` — cette phase ne les a pas
retestés (cf. §10 de la mission, économie de contexte), elle a seulement
vérifié que le B2B les atteint désormais avec des données valides.

## 12. Risques restants

- **Confirmation de changement de prix** (§5) : en l'état, un changement de
  prix détecté par myGo à la revalidation finale fait simplement échouer la
  réservation (aucun débit, message d'erreur classifié affiché) plutôt que
  de proposer à l'agent de confirmer le nouveau prix. Comportement sûr
  (aucun débit incorrect) mais moins fluide ; nécessiterait un état de
  pré-réservation pour être amélioré — décision produit hors périmètre.
- **Granularité mono-chambre** : une agence ne peut réserver qu'une chambre
  à la fois pour un hôtel donné via ce pont (identique au B2C). Une
  réservation multi-chambres nécessiterait un nouveau flux (panier) non
  construit ici, pour rester fidèle au périmètre minimal de la mission.
- **Fixture legacy encore joignable** : l'ancien chemin fixture
  (`search.offers`, `lib/pro/hotels-fixture.ts`,
  `components/pro/booking-travelers-form.tsx`,
  `components/pro/hotel-room-selector.tsx`) reste intact et atteignable si
  un lien externe pointe encore vers l'ancien format d'URL — il reproduit
  le bug du §2 (débit sans confirmation fournisseur réelle) s'il est encore
  utilisé quelque part. Aucun lien de l'application ne pointe plus vers ce
  chemin après cette phase (la page détail et le sélecteur de chambres ont
  été branchés sur le chemin réel), mais le code n'a pas été supprimé —
  décision délibérée de ne pas casser une route potentiellement encore
  bookmarkée, à trancher séparément si le fixture doit être retiré
  définitivement.
- **Pas de test d'intégration bout-en-bout avec myGo réel** dans ce
  sandbox (§11) — seule la couverture unitaire/statique existante garantit
  la correction du pipeline sous-jacent.
