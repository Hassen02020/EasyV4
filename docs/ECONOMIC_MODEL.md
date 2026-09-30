# EASY2BOOK — MODÈLE ÉCONOMIQUE (Phase 0 · ECONOMIC-MODEL-FREEZE-01)

> Statut : **D-01 à D-03 VALIDÉS PAR LA DIRECTION (2026-09-30). D-04 OPEN — bloqué en attente d'un avis d'expert-comptable
> tunisien.** Rien dans ce document n'est encore implémenté — la validation des décisions n'est PAS un GO de câblage.
> Rédigé le 30/09/2026 à partir de l'audit Commercial & Revenue 01 (`main` @ `fa96c53`) et du cadrage
> « Global Commerce, Local Accounting — One Commerce, Multiple Books ».
> Aucun code, aucune migration. Les décisions ci-dessous sont figées, mais **aucun chantier de câblage de revenu ne
> démarre sans un GO séparé et explicite** (ECON-BREAKDOWN-01, AGREEMENT-01, CURRENCY-DIM-01, ECON-WIRING-01,
> SETTLEMENT-OBLIGATIONS-01…). Prochaine étape : auditer ce que le code actuel respecte déjà de ce modèle et ce qui en
> diverge — pas encore implémenter.
>
> Chaque décision est marquée **[D-xx]** avec sa proposition et son statut de validation (§10).

---

## 0. Principe directeur

Easy2Book ne construit pas un moteur mondial de comptabilité. Easy2Book construit une infrastructure mondiale de
commerce et de règlement capable de représenter précisément **les droits économiques de chaque acteur**, puis de
permettre à chacun de tenir sa propre comptabilité selon son pays, sa devise, son régime fiscal et ses normes.

```text
ONE COMMERCE
  → COMMERCIAL AGREEMENT
  → ECONOMIC RULE
  → ECONOMIC BREAKDOWN (droits économiques)
  → MONEY EVENTS (wallet, PSP, banque)
  → SETTLEMENT
  → RECONCILIATION
  → ACCOUNTING PROJECTION (livre agence · livre Easy2Book · livre fournisseur)
  → CRM / NETWORK INTELLIGENCE
```

Trois règles non négociables :

1. **Le produit ne détermine pas l'économie.** `produit + vendeur + propriétaire + fournisseur + canal + accord → règle → breakdown`.
   Le module hôtel est identique dans les modèles A à E ; seul l'accord change.
2. **Le logiciel connaît le droit ; l'accord qualifie le droit.** « Commission », « platform fee », « revenue share »… sont
   une *qualification* d'un droit économique, pas des moteurs distincts.
3. **Aucun montant historique n'est réécrit.** Toute correction, annulation ou conversion est un événement compensatoire.

Séparation des couches (jamais synonymes) :

| Couche | Question | Porteur actuel dans le code |
| --- | --- | --- |
| Commercial | Qu'avons-nous vendu ? | `reservations` + extensions par module |
| Economic | Qui a droit à quoi ? | `reservation_financials` (partiel) → `economic_entitlements` (à créer) |
| Money | Quel argent a bougé ? | `payments`, `partner_credit_movements`, `wallet_ledger` |
| Settlement | Qui doit payer qui ? | `commission_settlements` (interne seulement) |
| Reconciliation | Tout concorde ? | `lib/finance/reconciliation.ts` |
| Accounting | Comment chacun comptabilise ? | `journal_entries` / `journal_lines` (existent, **0 écrivain**) |

---

## 1. Acteurs et rôles

| Rôle | Définition | Qui peut l'occuper |
| --- | --- | --- |
| `customer` | paie le prix client | voyageur, entreprise, agence (achat pour compte propre) |
| `seller` | fait la vente au client, porte la relation client | agence B2B, agence White Label, Easy2Book (B2C) |
| `product_owner` | possède l'offre commerciale (catalogue, prix, conditions) | Easy2Book, une agence, un partenaire |
| `supplier` | fournit la prestation physique | hôtel, myGo, compagnie, nœud fournisseur Network, DMC |
| `partner` | autre ayant droit prévu par l'accord (apporteur, WL, affilié) | tout acteur signataire |
| `easy2book` | infrastructure, distributeur, vendeur ou propriétaire selon l'accord | Easy2Book |

Un même acteur peut cumuler plusieurs rôles dans une transaction (ex. B2C Easy2Book : `seller` + `product_owner`).
Easy2Book peut être **plateforme, distributeur, vendeur ou propriétaire** — sans quatre moteurs financiers : c'est le rôle
porté dans le droit économique qui change.

Aujourd'hui (audit) : le code ne connaît qu'un acteur par réservation (`reservations.agency_id` = vendeur) et, pour
Network seulement, `reservation_network_product.supplier_node_id`. Le propriétaire n'est jamais enregistré sur la
réservation.

---

## 2. Accord commercial (Commercial Agreement)

Un accord répond, pour un périmètre donné, à neuf questions :

| Question | Champ proposé |
| --- | --- |
| Qui vend ? | `seller_party` |
| Qui possède ? | `owner_party` |
| Qui fournit ? | `supplier_party` (ou « tout fournisseur du produit ») |
| Qui gagne ? | lignes de règle par rôle |
| Qui paie ? | `payer_role` (en général `customer`, parfois `seller` pour le net) |
| Qui encaisse ? | `collector_party` (Easy2Book, vendeur, PSP du vendeur) |
| Combien ? | base + taux / montant fixe par rôle |
| Quand ? | fait générateur du droit (confirmation, voyage, fin de séjour) |
| Sous quelle règle ? | `rule_id`, priorité, validité |

Périmètre d'un accord : parties + canal (`b2c`, `b2b`, `network`, `white_label`, `api`) + filtres existants de
`margin_rules` (`supplier_id`, `product_type`, `destination`, seuils de prix, validité, priorité).

**Réutilisation** : `margin_rules` a déjà la forme d'une règle d'accord. On ajoute `commercial_agreements` (parties,
rôle d'Easy2Book, devise, validité, statut) et `margin_rules.agreement_id`. `pricing_margins` (System A) reste la marge
client propre à l'agence et n'est pas un accord.

**[D-01a] Qui détient le droit d'Easy2Book dans un accord ?**
Proposition : **Easy2Book uniquement** (création et modification super_admin). Une agence ne peut jamais modifier la
part d'Easy2Book. Aujourd'hui le taux vit dans une ligne `margin_rules` rattachée à l'agence (risque R-06 de l'audit).

**[D-01b] Base de calcul du droit Easy2Book** — une seule base par accord :

| Option | Formule | Avantage | Limite |
| --- | --- | --- | --- |
| 1. Sur la marge du vendeur | `(vente − coût) × taux` | déjà codé (`recordReservationFinancials`) | 0 quand marge = 0 (Omra, Packages, Activités) |
| 2. Sur le coût fournisseur | `coût × taux`, intégré au net vu par le vendeur | le vendeur voit un net « tout compris » | nécessite un net fournisseur réel |
| 3. Frais sur prix net | `net × taux` ou fixe, ligne distincte | fonctionne pour tous les modules et le réseau | nouvelle ligne visible pour le vendeur |

Proposition : **option 3 comme défaut réseau**, option 1 conservée pour les accords historiques Hôtel TN.
La Direction tranche.

**[D-01c] Fait générateur du droit** — proposition : `earned` à la **confirmation**, `settleable` à la date de
prestation (check-in, départ) pour que l'annulation avant prestation se traite en compensation sans flux d'argent.

---

## 3. Droit économique (Economic Entitlement)

### 3.1 Champs

| Champ | Contenu |
| --- | --- |
| `reservation_id` | commande d'origine (en-tête : `reservation_financials`) |
| `party_type`, `party_id` | acteur ayant droit (`agencies.id`, `supplier_nodes.id`, fournisseur externe, Easy2Book) |
| `role` | `seller` · `product_owner` · `supplier` · `partner` · `easy2book` · `tax_authority` · `discount` |
| `qualification` | `supplier_cost` · `seller_margin` · `owner_share` · `commission` · `platform_fee` · `distribution_fee` · `revenue_share` · `service_fee` · `tax` · `discount` |
| `amount`, `currency` | montant économique figé à la confirmation |
| `basis` | base de calcul et valeur (ex. `net × 5 %`) |
| `agreement_id`, `rule_id` | origine du droit |
| `status` | `pending` → `earned` → `settleable` → `settled` ; ou `compensated` |
| `effective_at` | date d'effet |
| `cancellation_treatment` | `full_reversal` · `pro_rata_fee` · `non_refundable` |
| `compensates_id` | pour une ligne compensatoire : la ligne qu'elle corrige |
| `settlement_status`, `settlement_ref` | position de règlement |

### 3.2 Invariants

1. **Somme des droits = prix client** (hors `tax_authority` si la TVA est ajoutée au-dessus du prix), contrôlée dans
   la même transaction que la réservation.
2. Un droit n'est **jamais modifié** après `earned` : seule une ligne compensatoire (montant de signe opposé,
   `compensates_id`) change la position nette.
3. Un droit Easy2Book n'existe **que s'il découle d'un accord** (`agreement_id` non nul) — plus de taux implicite.
4. Une seule fonction écrit les droits : `recordReservationFinancials()` étendue (règle « un seul chemin » de l'audit).

### 3.3 Qualification ≠ moteur

Le montant de 80 TND d'Easy2Book peut être une commission, un platform fee ou un revenue share selon l'accord. Le calcul
est le même ; seule la `qualification` change (et donc la projection comptable et fiscale de chaque acteur).

---

## 4. Annulation — événement économique compensatoire

Pour **chaque** droit, pas seulement celui d'Easy2Book :

```text
Réservation     E2B +80   vendeur +120   fournisseur +800
Annulation      E2B −80   vendeur −120   fournisseur −800   → net 0

Annulation avec 30 de frais d'annulation facturés par le fournisseur (le client paie 30) :
                fournisseur −770 (garde 30)   vendeur −120   E2B −80   → net : fournisseur +30, autres 0

Variante prévue par l'accord (Easy2Book conserve 30 de frais de service) :
                E2B −50 → net E2B +30
```

**[D-02a] Traitement par rôle en cas d'annulation** — proposition par défaut :

| Rôle | Annulation gratuite | Annulation avec frais fournisseur |
| --- | --- | --- |
| `supplier` | compensation totale | garde les frais facturés |
| `seller` | compensation totale | selon accord ; défaut : compensation totale |
| `product_owner` | compensation totale | selon accord ; défaut : compensation totale |
| `easy2book` | compensation totale | selon accord ; défaut : compensation totale |

Remplace l'ancien chantier COMMISSION-REVERSAL-01 : pas de `reverseCommission()` isolé.
Garde-fou jusqu'à l'implémentation : **aucune règle de commission activée en production** (état actuel : 0 règle).

---

## 5. Droits vs mouvements d'argent (Money Events)

```text
ORDER CONFIRMED
  → Economic Breakdown figé (droits)
  → Money Events : débit vendeur (wallet) · dette fournisseur · dette propriétaire · droit E2B
  → Settlement : agrégation des droits `settleable` non réglés, par contrepartie et devise
  → Reconciliation : Σ droits = Σ mouvements = Σ settlements
  → Accounting projection
```

- **Wallet** = ce que l'acteur peut utiliser. Existe (B2B `agencies.deposit_balance` + `partner_credit_movements`,
  B2C `wallet_accounts` + `wallet_ledger`). **Inchangé.**
- `wallet_ledger` est une trace opérationnelle, **jamais** le livre du réseau.
- Le crédit actuel de `credit_platform_commission()` (crédit sans contrepartie, risque R-02) est remplacé par un droit
  `easy2book` : l'argent reste où il a été encaissé ; le settlement dit qui doit quoi.

---

## 6. Devise

À conserver séparément, sur l'en-tête et sur chaque droit :

| Dimension | Existe déjà |
| --- | --- |
| montant / devise d'origine | `reservations.original_amount/original_currency` |
| montant / devise d'affichage | non |
| montant / devise économique | `reservation_financials.sale_currency` (toujours écrit `TND`) |
| montant / devise de settlement | non |
| montant / devise comptable (par livre) | non |
| taux, source, horodatage | `reservation_financials.exchange_rate/exchange_rate_at` (jamais renseignés), table `exchange_rates` (aucun lecteur) |

Règle : une conversion ultérieure crée une nouvelle valeur datée ; elle ne réécrit jamais le montant d'origine.

**[D-03] Devises de référence** — proposition : devise fonctionnelle Easy2Book = **TND** ; devise économique d'un
droit = devise de l'accord ; devise de settlement = devise de l'accord, sauf mention contraire.

---

## 7. Fiscalité — contexte stocké, pas propriété du produit

Aujourd'hui : `lib/booking/pricing.ts` applique `vatRate = 19` par défaut ; aucune colonne fiscale dans
`reservation_financials`. C'est le modèle `hotel.vat = 19 %` à abandonner.

Le cœur stocke le **contexte fiscal appliqué** : pays et entité légale de chaque partie, lieu de prestation, rôle
commercial, régime, taux, montant — sous forme de droit `tax_authority`. Il ne calcule pas la fiscalité d'autrui et ne
remplace pas le conseil local.

**[D-04] Régimes applicables par rôle** (marge d'agence de voyage, débours, commission d'intermédiaire…) —
**avis d'un expert-comptable tunisien requis avant tout code fiscal.** Aucun chantier TAX-CONTEXT-01 sans cet avis.

---

## 8. Les cinq modèles, exprimés comme accords

Montants illustratifs en TND. « Aujourd'hui » = constat de l'audit (production : 0 règle `margin_rules`, droit E2B = 0).

### 8.1 Modèle D — Agence A vend le produit de l'Agence B via le réseau (cas de référence)

```text
Prix client                    1 000
  fournisseur (nœud C)            700   supplier_cost
  propriétaire (agence B)         150   owner_share
  vendeur (agence A)              100   seller_margin
  Easy2Book                        50   platform_fee (option 3)
                                -----
                                1 000
```

Aujourd'hui : A est débitée de 1 000 ; B reçoit **0** ; le nœud C n'a **aucune dette enregistrée** ; Easy2Book reçoit
`marge × taux` = 0. Autorisation réelle (RLS `products` + `product_authorizations`), réservation bloquée par le bug
NETWORK-NODE-VISIBILITY-01 (PR #79).

### 8.2 Modèle A — Easy2Book vend son propre produit (B2C)

```text
Prix client 1 000 = fournisseur 850 (supplier_cost) + Easy2Book 150 (seller_margin)
```

Easy2Book est vendeur et propriétaire : il tient son **livre complet** (vente, coût, marge, créance, dette fournisseur,
TVA, paiement, remboursement). Aujourd'hui : vente/coût/marge enregistrés ; dette fournisseur, TVA et journal absents.

### 8.3 Modèle B — Une agence vend un produit Easy2Book

```text
Prix client 1 000 = fournisseur 850 + agence 110 (seller_margin) + Easy2Book 40 (distribution_fee)
```

Aujourd'hui : agence débitée du prix de vente, marge agence = défaut 10 % codé, droit E2B = 0.

### 8.4 Modèle C — Easy2Book vend le produit d'un partenaire

```text
Prix client 1 000 = partenaire propriétaire 900 (owner_share, coût inclus) + Easy2Book 100 (seller_margin)
```

Aujourd'hui : non supporté (pas de vente B2C Network, 0 produit).

### 8.5 Modèle E — White Label

```text
Prix client 1 000 = fournisseur 850 + agence WL 120 (seller_margin) + Easy2Book 30 (platform_fee)
```

Aujourd'hui : runtime WL réel (domaine, branding, `product_authorizations`), aucune règle économique spécifique.

---

## 9. Ce que ce modèle réutilise (aucun nouveau moteur)

| Existant | Rôle dans le modèle |
| --- | --- |
| `applyMargin()` / `getMarginsForAgency()` | calcul du prix client (inchangé) |
| `margin_rules` | règles d'accord (+ `agreement_id`) |
| `reservation_financials` | en-tête économique figé |
| `recordReservationFinancials()` | unique écrivain des droits |
| `debitPartnerCredit` / `debitCustomerWallet` | money events (inchangés) |
| `commission_settlements` / `_entries` | settlement par contrepartie (étendu) |
| `reconciliation.ts` | contrôles Σ droits = Σ mouvements = Σ settlements |
| `journal_entries` / `journal_lines` | livre Easy2Book uniquement |
| `exchange_rates` | taux datés |

Seules tables nouvelles au cœur : `commercial_agreements`, `economic_entitlements`.

---

## 10. Décisions tranchées (Direction, 2026-09-30)

- [x] **D-01a** — VALIDÉ. Le droit d'Easy2Book est fixé par Easy2Book seul (super_admin) ; une agence ne peut jamais
      modifier la part d'Easy2Book.
- [x] **D-01b** — VALIDÉ avec coexistence explicite legacy/réseau (pas un remplacement uniforme) :
      **option 3 « frais/% sur prix net »** = défaut pour le réseau Easy2Book (Network et tout nouvel accord) —
      seule base qui fonctionne uniformément sur les 9 modules, y compris ceux à marge 0 aujourd'hui (Omra, Packages,
      Activités) ; **option 1 « % de la marge vendeur »** reste en vigueur pour les accords Hôtel TN existants, sans
      réécriture rétroactive pour ne pas casser ce qui tourne déjà.
- [x] **D-01c** — VALIDÉ. `earned` à la confirmation → `settleable` à la réalisation du service (check-in/départ).
      Objectif explicite : rendre propre annulation, remboursement, no-show, reversal, commission et settlement, en
      évitant le modèle « confirmation = argent définitivement acquis ».
- [x] **D-02** — VALIDÉ. Omra/Packages/Activités/Car sont monétisables par accord (option 3). Car : seulement après
      harmonisation de ses deux moteurs de prix (référence : audit Commercial & Revenue 01, gap déjà documenté
      ROADMAP R3-02/R6-02 — pas une divergence numérique entre deux formules, mais `car` exclu du type
      `MarginModule` et sans UI d'écriture de taux, cf. clôture COMMERCIAL-REVENUE-02).
- [x] **D-02a** — VALIDÉ. Compensation/reversal économique par rôle (tableau §4), jamais de réécriture d'une écriture
      historique — cohérent avec l'invariant append-only déjà prouvé sur `wallet_ledger`/`partner_credit_movements`.
- [x] **D-03** — VALIDÉ. TND = devise fonctionnelle Easy2Book ; devise économique et de settlement d'un droit =
      devise de l'accord.
- [ ] **D-04** — **OPEN / BLOQUÉ, volontairement non tranché.** Aucun avis d'expert-comptable tunisien obtenu à ce
      jour sur les régimes fiscaux applicables par rôle. Décision explicite : ne pas chercher à combler cette
      décision en interne. `TAX-CONTEXT-01` reste bloqué indépendamment des 6 décisions ci-dessus, même une fois
      celles-ci mises en œuvre.
- [ ] Validation des 5 exemples chiffrés (§8) — à faire au moment de l'audit de conformité (prochaine étape),
      Network (modèle D) en premier.

**Prochaine étape (pas un GO d'implémentation)** : auditer le code réel (`main` courant) par rapport à ces 6
décisions validées — ce qu'il respecte déjà (ex. `applyMargin()`, `margin_rules`, append-only du ledger) et ce qui en
diverge (ex. aucune table `commercial_agreements`/`economic_entitlements`, `credit_platform_commission()` crédite
sans contrepartie — R-02, taux vivant dans une ligne appartenant à l'agence — R-06). Cet audit produira la fiche
chantier ECON-BREAKDOWN-01 (ou équivalent), soumise à son propre GO avant tout code.

## 11. Hors périmètre de ce document

Pas de schéma SQL détaillé, pas de code, pas de migration, pas de calcul fiscal, pas de comptabilité des agences ou
fournisseurs (seulement l'export de leurs droits). Ces points sont traités chantier par chantier, après validation,
un GO à la fois.
