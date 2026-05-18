# Test Plan — PR #9 Portail B2B (focus Phase 9 : marges dynamiques)

## What changed (user-visible)

Le portail B2B `/pro/*` applique désormais une **marge configurable par agence** sur tous les prix affichés (SERP, détail, tunnel de réservation). La marge se lit dans la table `pricing_margins` (clé `agency_id × module`) et tombe sur `DEFAULT_MARGINS` si rien n'est défini en BDD.

Avant ce PR : les prix `fixture` étaient affichés bruts (`841,253 DT` pour Carthage Thalasso BB).
Après ce PR : les prix sont markup'és par la marge `hotel` de l'agence connectée (`841,253 × 1.10 = 925,378 DT` au défaut 10%).

## Code paths grounded

- Helper de markup : <ref_snippet file="/home/ubuntu/repos/EasyV4/lib/pro/pricing.ts" lines="37-62" />
- Application server-side sur SERP : <ref_snippet file="/home/ubuntu/repos/EasyV4/app/pro/(app)/hotels/page.tsx" lines="52-61" />
- Application server-side sur détail : <ref_snippet file="/home/ubuntu/repos/EasyV4/app/pro/(app)/hotels/[id]/page.tsx" lines="43-52" />
- Card hôtel rendant le prix : <ref_snippet file="/home/ubuntu/repos/EasyV4/components/pro/hotel-card.tsx" lines="195-210" />
- Fixture raw : `lib/pro/hotels-fixture.ts:88-91` — Carthage Thalasso BB **841.253 DT** (raw, hors marge)
- BDD locale a déjà 6 lignes `pricing_margins` pour `silianos-kesra-test` avec `hotel = 10% percent`

## Primary flow — Test 1 : Marge propagée sur SERP (preuve de l'aspect dynamique)

### Préconditions
- BDD locale `pricing_margins` pour agence `silianos-kesra-test` : `hotel = percent 10` (déjà en place)
- super_admin connecté → preview mode sur agence partenaire
- Carthage Thalasso BB raw = 841.253 DT

### Step 1 — Vérifier marge 10% par défaut
- **Action** : ouvrir `/pro/hotels?destinationId=region-tunis-carthage&checkin=2026-06-15&checkout=2026-06-20&adults=2`
- **Trouver la card "Carthage Thalasso Resort"** (par nom, pas par position)
- **Pass** : la card affiche `À partir de` `925,378 DT` (= 841.253 × 1.10, arrondi 3 décimales)
- **Fail si** : affiche `841,253 DT` (marge non appliquée) ou tout autre montant

### Step 2 — Changer la marge à 25% en BDD
- **Action** : exécuter via psql `UPDATE pricing_margins SET margin_value=25 WHERE agency_id='74db2847-...' AND module='hotel';`
- **Action** : recharger `/pro/hotels?...` (Cmd+R)
- **Trouver la card "Carthage Thalasso Resort"**
- **Pass** : la card affiche `À partir de` `1 051,566 DT` (= 841.253 × 1.25, formatté `fr-FR`)
- **Fail si** : continue à afficher `925,378 DT` (marge cached / non rechargée) ou `841,253 DT`

### Step 3 — Vérifier le détail hôtel (markup'é sur la page détail)
- **Action** : cliquer sur la card "Carthage Thalasso Resort" → page `/pro/hotels/carthage-thalasso`
- **Trouver le bloc "Pension Petit Déjeuner / BB"** dans le résumé
- **Pass** : prix affiché `1 051,566 DT` (même valeur que la SERP — markup appliqué côté détail aussi)
- **Fail si** : prix `841,253 DT` ou `925,378 DT`

### Adversarial check
> *"Would this same sequence look identical if the change were broken?"* — Non :
> - Si `applyMarginsToHotel` n'était pas câblé sur SERP, Step 1 verrait `841,253 DT`
> - Si `getActivePartnerMargins` n'était pas câblé sur SERP, Step 1 verrait `925,378 DT` (default) mais Step 2 verrait toujours `925,378 DT` (mutation BDD ignorée)
> - Si la même marge n'était pas appliquée sur le détail, Step 3 verrait `841,253 DT` ou `925,378 DT`

## Smoke test — Test 2 : Navigation tunnel reste fonctionnelle (regression)

Étapes :
1. Sur SERP, cliquer "Tarifs & chambres" sur Carthage Thalasso
2. Sélectionner 1 chambre Standard Double BB qty=1, cliquer "Suivant"
3. Sur form voyageurs, remplir Nom/Prénom du Voyageur Principal
4. Cliquer "Confirmer la réservation"

**Pass** : Redirige vers `/pro/booking/confirmation/B2B-YYYYMMDD-XXXX` avec un récap qui inclut un total cohérent avec la marge 25% active (subtotal ≥ 1 051 DT pour 1 chambre).

**Fail si** : Crash, erreur 500, ou total ne reflète pas la marge.

## Restoration

Après le test, restaurer `pricing_margins.hotel` à 10% pour ne pas polluer la BDD :
```sql
UPDATE pricing_margins SET margin_value=10 WHERE agency_id='74db2847-...' AND module='hotel';
```

## Out of scope (déjà couvert par les 8 tests unitaires)
- Validation des arrondis 3 décimales (`applyMargin`)
- Marge `fixed` vs `percent`
- Marge `isActive=false` (passthrough)
- Markup sur `RoomOffer[]` séparé de `boardings`

## Out of scope (testé visuellement par regression légère seulement)
- Validation regex matricule fiscale (`/pro/etablissement`)
- Data Tables back-office (`/pro/reservations`, `/clients`, …) — mock data, pas critique
- Widget "Mon Crédit" Realtime (UAT manuelle plus tard)
