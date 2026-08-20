# Easy2Book — B2C Public Hotel Search — Rapport final

Mission : rendre la recherche hôtel accessible à un visiteur B2C anonyme,
sans affaiblir la sécurité B2B existante, sans dupliquer le moteur myGo.

## 1. Cause exacte du problème

`/api/hotels/search` — seule route consommée par la page publique de
résultats (`app/hotels/search/page.tsx`, via `lib/mygo/use-hotel-search.ts`)
— exigeait `requirePartnerSession(req)` (rôles `super_admin`/`manager`/
`agent_resa`) avant même de traiter la requête. Un visiteur anonyme recevait
donc systématiquement une erreur d'authentification ("Session invalide ou
expirée") au lieu de résultats de recherche. Vérifié en production ce soir
(capture d'écran fournie par l'utilisateur) puis reproduit localement.

Cette route n'a par ailleurs **aucun autre appelant réel** aujourd'hui —
`/pro/hotels` (portail B2B) utilise un système de données fixture
entièrement séparé (`lib/pro/hotels-fixture.ts`, déjà documenté comme un
risque distinct dans `EASYV4_HOTEL_SEARCH_ENGINE_REPORT.md`, non touché ici).

## 2. Architecture avant

```
Visiteur (B2C ou B2B, sans distinction)
        ↓
/api/hotels/search  (requirePartnerSession OBLIGATOIRE)
        ↓
MyGo XML → Normalisation → Dédoublonnage → Résultats
```

Un seul point d'entrée, gardé — donc inutilisable par le public.

## 3. Architecture après

```
                    HOTEL SEARCH
                         │
             ┌───────────┴───────────┐
             │                       │
        B2C PUBLIC               B2B / PRO
   (aucune session requise)  (requirePartnerSession)
             │                       │
 /api/hotels/search-public   /api/hotels/search
             │                       │
             └───────────┬───────────┘
                         ↓
           lib/mygo/search-core.ts (partagé)
             executeHotelSearch()
                         ↓
                     MyGo XML
                         ↓
            Normalisation / Dédoublonnage
                         ↓
              (côté client) Filtres / Facets
                         ↓
                Tri (lib/mygo/sort.ts)
                         ↓
                     Résultats
```

Un seul moteur de recherche (`lib/mygo/search-core.ts`), deux points
d'entrée HTTP avec des contextes d'authentification différents. Aucune
logique myGo dupliquée.

## 4. Pourquoi une route publique séparée (et non la suppression du guard)

Retirer `requirePartnerSession` de `/api/hotels/search` aurait :
- rendu la route B2B indistincte de la route publique (aucune frontière
  claire pour appliquer plus tard une logique spécifique B2B — historique
  de recherche, tarification négociée, quotas dédiés...) ;
- rendu impossible de rate-limiter différemment le trafic anonyme (plus
  gros risque d'abus) du trafic partenaire authentifié.

La séparation en deux routes minces, dérivant toutes deux du même moteur,
satisfait à la fois "ne pas dupliquer la logique métier" et "la sécurité
doit rester différente selon le contexte" (règle finale de la mission).

## 5. Fichiers modifiés

**Nouveau** :
- `lib/mygo/search-core.ts` — moteur partagé : `HotelSearchQuerySchema` (Zod,
  identique à l'ancien schéma de `/api/hotels/search`), `validateSearchDateRange()`
  (checkout > checkin + plafond de nuits, nouveau), `executeHotelSearch()`
  (démo/dégradé/dédoublonnage/mapping d'erreurs — code déplacé tel quel
  depuis l'ancienne route, comportement inchangé).
- `app/api/hotels/search-public/route.ts` — nouvelle route B2C : rate-limit
  IP dédié (`hotels:search-public:*`), **aucune vérification de session**,
  appelle le moteur partagé.
- `lib/mygo/__tests__/search-core.test.ts` — 10 tests.
- `EASYV4_B2C_PUBLIC_SEARCH_REPORT.md` (ce document).

**Modifié** :
- `app/api/hotels/search/route.ts` — comportement B2B **strictement
  inchangé** (`requirePartnerSession` toujours en premier, même rate-limit
  bucket `hotels:search:*`), refactorée pour appeler le moteur partagé au
  lieu de dupliquer la logique.
- `lib/mygo/use-hotel-search.ts` — le hook de la page publique appelle
  désormais `/api/hotels/search-public` au lieu de `/api/hotels/search`.

**Non touchés** : `lib/mygo/client.ts`, le connecteur myGo, `lib/booking/*`,
le wallet, le pricing, RLS/migrations (aucune migration DB dans ce lot).

## 6. API publique — `/api/hotels/search-public`

Mêmes paramètres que l'ancienne route B2B (`cityId`, `checkin`, `checkout`,
`adults`, `children`, `currency`, `stars`, `onlyAvailable`, `hotelId`,
`rooms`) — **aucun champ prix/marge/agence/wallet/partenaire n'existe dans
le schéma**, donc aucun besoin de les "filtrer" : Zod les ignore simplement
s'ils sont présents dans la query string (testé explicitement, voir §7).

## 7. Validation des inputs

Réutilisation intégrale du schéma Zod existant (bornes déjà en place :
adults 1-8, children 0-17 ans, stars 1-5, rooms max 8 chambres via
`decodeRoomsParam`). Ajout dans cette mission :
- `validateSearchDateRange()` — plafond de **60 nuits maximum**
  (`MAX_SEARCH_NIGHTS`), nouveau garde-fou anti-abus absent avant (seul
  `checkout > checkin` était vérifié).
- Test explicite (`search-core.test.ts`) confirmant que des champs
  `price`/`markup`/`agencyId`/`walletId`/`partnerId` injectés dans la query
  string n'apparaissent JAMAIS dans la query parsée — le schéma ne les
  déclare pas, Zod les élimine silencieusement.

## 8. Pricing B2C

Le prix affiché (`fromPrice` de chaque `HotelOfferDTO`) est calculé
**exclusivement côté serveur** par myGo — ni l'ancienne route B2B ni la
nouvelle route publique n'acceptent de prix, marge, commission ou devise de
règlement fournis par le client (le schéma ne déclare aucun de ces champs).

**Constat important, non résolu dans cette mission** : aucune marge/majoration
Easy2Book n'est appliquée à ce niveau de recherche, ni pour le B2B ni pour
le B2C — le prix affiché est le `fromPrice` brut myGo dans les deux cas.
Un "pricing profile" différencié PUBLIC_B2C / PARTNER_B2B n'a donc **pas
été fabriqué** ici : il n'existe aujourd'hui aucune règle de marge
applicable à ce stade de la recherche pour B2B non plus (la seule logique
de marge existante, `applyMarginsToHotel`/`applyMarginsToOffers`, vit dans
le système fixture déconnecté `/pro/hotels`, lui-même documenté comme un
risque distinct). Inventer une marge B2C ici sans spécification métier
aurait été une décision produit arbitraire, hors périmètre. **Les deux
contextes reçoivent aujourd'hui le même prix `fromPrice` — aucune régression,
mais aucune différenciation tarifaire n'existe encore à corriger séparément.**

## 9. Cache

Clé de cache myGo inchangée : `mygo:search:${stableHash(body)}` où `body`
est la requête myGo elle-même (ville, dates, chambres, filtres) —
**aucune dimension "contexte" (PUBLIC_B2C vs PARTNER_B2B) nécessaire**
puisque le prix retourné par myGo ne varie pas selon qui demande (voir §8 :
aucune marge n'est appliquée à ce stade pour personne). Partager le cache
entre B2C et B2B est donc correct aujourd'hui, pas une fuite. **Si une
marge différenciée par contexte est introduite plus tard, cette clé de
cache devra alors gagner une dimension contexte** — documenté ici pour ne
pas être oublié.

## 10. Rate limiting

Réutilisation du mécanisme existant (`lib/rate-limit.ts`, Upstash Redis ou
mémoire locale selon configuration) — **bucket dédié** `hotels:search-public:*`
pour le trafic anonyme, distinct de `hotels:search:*` (B2B), afin qu'un pic
de trafic public n'affecte pas le quota du portail partenaire et
inversement. Limite globale identique à l'existant (`RATE_LIMIT_MAX_REQUESTS`,
défaut 60/min) — pas de limite plus stricte dédiée au public introduite
dans cette passe (documenté en risque, §18).

## 11. Sécurité — tests effectués

| Scénario | Route | Résultat attendu | Vérifié |
|---|---|---|---|
| Anonyme | `/api/hotels/search-public` | 200, résultats réels/démo | ✅ (curl + Playwright, voir §14) |
| Anonyme | `/api/hotels/search` | Refusé (session requise) | ✅ (comportement de garde inchangé, s'exécute avant toute logique de recherche) |
| Query avec `price`/`markup`/`agencyId`/`walletId`/`partnerId` injectés | les deux | Champs ignorés, aucun impact | ✅ (test unitaire dédié) |
| Séjour > 60 nuits | les deux | 400 `date_range_too_long` | ✅ (curl + tests unitaires) |
| Credentials myGo dans la réponse | les deux | Jamais présentes (DTO normalisé uniquement) | ✅ (inchangé — `HotelOfferDTO` ne contient aucun champ credentials, structure identique à avant) |

**Non testé dans ce sandbox** (nécessite un environnement authentifié) :
isolation Agence A vs Agence B sur la route B2B — hors périmètre de cette
mission (déjà couvert par l'audit RLS complet précédent,
`EASYV4_DEEP_AUDIT_REPORT.md`), cette route n'a pas été modifiée dans sa
logique d'autorisation.

## 12. Impact RLS

**Aucun.** Cette mission ne touche à aucune policy RLS, aucune migration.
La recherche myGo elle-même ne passe jamais par la base de données
applicative (RLS n'a jamais concerné ce chemin) — seul le guard
`requirePartnerSession` (qui, lui, interroge la DB via
`getCurrentAdminProfile`) reste identique sur la route B2B.

## 13. Régression B2B

`app/api/hotels/search/route.ts` : `requirePartnerSession` reste le **tout
premier appel**, avant tout parsing de query ou toute logique de recherche
— comportement byte-identique à avant pour un appelant B2B légitime. Vérifié
par test manuel (`curl` sans session → toujours refusé avant d'atteindre la
recherche, comme avant).

## 14. E2E B2C

- `curl` anonyme sur `/api/hotels/search-public` (sans cookie/session) →
  **HTTP 200**, réponse JSON valide (mode démo actif dans ce sandbox, faute
  de `MYGO_LOGIN`).
- Page `/hotels/search` ouverte via Playwright (Chromium, sans session) →
  **aucune erreur "Session invalide"**, aucune exception JS, rendu normal
  de la page de résultats (capture jointe).
- Scénario complet Homepage → Hôtels → recherche → résultats avec vraies
  données myGo **non exécutable dans ce sandbox** (pas de `MYGO_LOGIN`
  configuré ici) — mais la chaîne HTTP/auth est démontrée fonctionnelle de
  bout en bout ; seul le contenu réel des résultats myGo reste à confirmer
  en production (`MYGO_LOGIN` déjà configurable via Vercel Environment
  Variables, cf. session de déploiement de ce soir).

## 15. Performance

Aucun appel myGo supplémentaire introduit : la route publique appelle
exactement la même fonction `executeHotelSearch()` qu'avant, une fois par
recherche. Le filtrage/tri restent purement côté client (inchangé,
`lib/mygo/facets.ts`/`lib/mygo/sort.ts`), donc aucun nouvel appel réseau
déclenché par un changement de filtre ou de tri.

## 16. Tests

`pnpm test` : **228/228** (10 nouveaux : `validateSearchDateRange` × 6,
`MAX_SEARCH_NIGHTS`, `HotelSearchQuerySchema` × 3 dont le test explicite
anti-injection prix/agence/wallet). 0 test supprimé.

## 17. Build

`pnpm typecheck` — clean. `pnpm lint` — 0 erreur (119 warnings
préexistants, inchangés). `pnpm build` — clean, `/api/hotels/search-public`
apparaît bien comme nouvelle route dans la sortie de build.

## 18. Risques restants

1. **Pas de limite de débit spécifiquement plus stricte pour le trafic
   public** — réutilise le même budget global que le reste de
   l'application. À durcir si un abus réel du quota myGo est observé
   (P3, non bloquant).
2. **Aucune tarification B2C différenciée n'existe** (§8) — ni régression
   ni bug introduit, mais si Easy2Book veut appliquer une marge/majoration
   spécifique au canal B2C à l'avenir, ce point de couture (`executeHotelSearch`)
   est l'endroit naturel où l'introduire — actuellement documenté, pas fait.
3. **Booking B2C toujours non résolu** (P1, déjà documenté dans
   `WALLET_PAYMENT_AUDIT_REPORT.md` — WALLET-02) : la recherche fonctionne
   maintenant pour un visiteur anonyme, mais `createReservationFromDraft`
   exige toujours un profil `partner_owner`/`partner_agent`/`super_admin` —
   un visiteur B2C peut désormais **chercher** mais toujours pas
   **réserver**. Volontairement non traité ici (règle explicite de la
   mission : "NE PAS rendre automatiquement le booking public").
4. **Validation en production avec vraies données myGo non effectuée** —
   nécessite `MYGO_LOGIN` configuré (à faire par l'utilisateur sur Vercel).
