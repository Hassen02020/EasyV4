# Audit — Vision architecture cible vs existant réel

Contexte : le fondateur a partagé une vision cible (Supplier Hub multi-fournisseur,
Wallet/Ledger multi-canal, CRM, modèle multi-tenant B2C/B2B/White-Label/Mutuelle,
roadmap 2026→2027), avec l'instruction "auditer moderner et executer en partant de
l'existant". La roadmap Destination (8/8 chantiers) était en cours et a été terminée
en premier, conformément à "un chantier à la fois". Cet audit compare, pilier par
pilier, la vision à ce qui existe réellement dans le code — vérifié par lecture de
fichiers réels, aucune donnée inventée.

**Règle absolue rappelée** : le moteur Wallet/Settlement certifié
(`lib/finance/customer-wallet.ts`, `reservation-webhook-core.ts`,
`manual-payment-actions.ts`, `lib/pro/booking-actions.ts`, `refund-logic.ts`,
`lib/admin/agencies-actions.ts` — 19/19 PASS E2E, voir
`docs/audits/wallet-financial-certification-report.md`) ne doit jamais être modifié.
Toute piste ci-dessous qui toucherait ces fichiers est explicitement écartée ou
marquée comme nécessitant un feu vert dédié et prudent.

## 1. Supplier Hub multi-fournisseur

| Module | État réel |
|---|---|
| Hôtels Tunisie | Hub complet, multi-fournisseur, orchestration parallèle avec isolation par timeout (`lib/hotel-suppliers/**`, Phase 28) |
| Hôtels Monde / Vols | Fondation minimale posée au chantier 7 (`lib/hotels-monde/supplier-drivers.ts`, `lib/vols/supplier-drivers.ts`) — driver registry + `Promise.allSettled`, mais un seul driver réellement CONFIGURED aujourd'hui (mode démo ou stub API réel, mutuellement exclusifs) |
| Car / Transferts | **Pas un produit "fournisseur externe" du tout** — vérifié : `lib/cars/pricing.ts` et `lib/transfers/pricing.ts` calculent un prix depuis `car_pricing_rates`/tarifs propres à l'agence (flotte/service détenu par Easy2Book lui-même), aucun `client.ts` ni concept de supplier driver. La vision "Supplier Hub" ne s'applique pas à ces deux modules — ce sont des produits à inventaire propre, pas des produits à approvisionner. |

**Conclusion** : le Supplier Hub existe déjà là où il a un sens (Hôtels), et sa
fondation multi-fournisseur est posée là où un futur fournisseur est plausible
(Hôtels Monde, Vols). Aucun gap supplémentaire actionnable ici sans un vrai second
fournisseur documentable — situation inchangée depuis l'audit chantier 7.

## 2. Wallet/Ledger multi-canal

Deux moteurs réels et **délibérément séparés**, tous deux vérifiés par lecture de
code (pas de spéculation) :

- **Wallet client B2C** — `wallet_accounts`/`wallet_ledger`
  (`lib/db/schema/financials.ts`), `lib/finance/customer-wallet.ts`. C'est le moteur
  certifié ci-dessus.
- **Ledger agence B2B** — `agencies.deposit_balance` + `partner_credit_movements`
  (`lib/finance/ledger.ts`, `lib/pro/booking-actions.ts::debitPartnerCredit`), UI
  `/b2b/wallet`, `/pro/releve-compte`.

Le schéma peut techniquement représenter les deux dans les mêmes tables
(`wallet_accounts_owner_check` = agencyId XOR customerId), mais le code maintient
sciemment deux chemins séparés — jamais fusionnés, par choix documenté dans les
commentaires de `customer-wallet.ts`.

**Gaps réels vs la vision "multi-canal"** :
- Aucun champ *channel* sur une transaction (`payments`, `wallet_ledger`,
  `partner_credit_movements`) — le seul `channels` qui existe est au niveau
  *produit* (`b2c`/`b2b`/`white_label`), pas au niveau transaction financière.
- `journal_entry_status` (enum draft/posted/reversed) existe dans le schéma mais
  **aucune table `journal_entries` ne l'utilise** — scaffolding mort, pas une
  fonctionnalité partielle.
- Aucun wallet/solde pour "mutuelle" — n'existe nulle part.

Toucher ce périmètre pour ajouter un tag *channel* aux transactions financières
impliquerait de modifier des fichiers du moteur certifié — **explicitement hors
périmètre sans feu vert dédié et une analyse de risque séparée**, indépendamment de
cet audit.

## 3. CRM

- `crm_conversations`/`crm_messages` (boîte de réception omnicanale — whatsapp,
  instagram, messenger, call, email, web) : réel, mais seul WhatsApp est câblé à un
  vrai provider (Meta Cloud API).
- `lib/crm/provider.ts` (interface `CrmProvider`) : la seule implémentation est
  `NotConfiguredCrmProvider`, qui retourne systématiquement
  `CRM_PROVIDER_NOT_CONFIGURED` — décision déjà documentée dans le code : "aucun
  système CRM choisi pour ce projet."
- `lib/loyalty/rewards-core.ts` + `loyalty_ledger` : système de points réel,
  volontairement jamais fusionné avec le wallet (commenté explicitement dans le
  schéma).

**Conclusion** : il n'y a pas de gap "de code" ici — il y a une décision business en
attente (quel CRM/provider réel intégrer). Aucune piste de code n'est actionnable
sans que ce choix soit fait par vous.

## 4. Multi-tenant / White-Label / channels

- `agencies` (`lib/db/schema.ts:152-251`) : table réelle, avec `domain` (unique),
  `brandName`, `logoUrl`. Le White-Label = une ligne `agencyType='ota'` avec
  `domain` renseigné — résolution hostname→tenant réellement câblée en prod
  (`proxy.ts::resolveTenantForHost()` → headers `x-tenant-*` → `current-tenant.ts`
  → `header-wrapper.tsx`).
- **Surface de branding réelle mais superficielle** : logo + nom de marque
  uniquement dans le header. Aucune preuve de thématisation plus profonde (couleurs,
  CSS par tenant, pages de pricing dédiées).
- `PRODUCT_CHANNELS = ["b2c", "b2b", "white_label"]` (`lib/admin/product-constants.ts`)
  — **aucune valeur "mutuelle"** n'existe, ni dans les channels produit ni dans
  `agencyType` (enum limité à `ota`/`partner`). `/mutuelle` est seulement une
  exemption de route (`route-scope.ts`) + un dashboard placeholder
  (`app/(internal)/mutuelle/(app)/page.tsx`, cartes à "—", commentaire "pas encore
  connecté à une source de données").
- RLS Postgres : réel et étendu — 71 `ENABLE/FORCE ROW LEVEL SECURITY`, 50
  `CREATE POLICY` sur 14 fichiers de migration, `current_agency_id()` GUC pattern
  appliqué de façon cohérente.
- **Un seul agence réellement configurée en pratique** : une deuxième agence
  ("Sahara Voyages", `agencyType='partner'`) n'existe que dans le seed de test local
  (`scripts/seed-base-infra.ts`), explicitement pour tester l'isolation — aucune
  trace d'une vraie deuxième agence en production.

**Conclusion** : le socle multi-tenant (RLS, résolution hostname, isolation) est
réel et solide. Ce qui manque pour que la vision "multi-canal/multi-entreprise" soit
vraie en pratique, ce n'est pas de l'infrastructure — c'est (a) une vraie deuxième
agence/tenant configurée en production, et (b) une profondeur de branding au-delà du
logo, si un vrai partenaire White-Label devait onboarder demain.

## Pistes concrètes, actionnables sans données inventées

| Piste | Nature | Touche le moteur certifié ? |
|---|---|---|
| A. Approfondir le branding White-Label (thème/couleur par agence, au-delà du logo) | Additif, UI + colonne(s) sur `agencies` | Non |
| B. Câbler un vrai deuxième provider CRM | Bloqué — nécessite un choix business (quel outil réel) | Non, mais hors code pur |
| C. Ajouter un champ *channel* aux transactions financières | Architecture | **Oui — nécessite feu vert dédié séparé, hors de cette discipline "un chantier à la fois" standard** |
| D. Construire le portail Mutuelle réel (au-delà du placeholder) | Nécessite de définir le modèle métier mutuelle (quelles données, quel flux) — pas déductible du code existant | Non, mais nécessite vos specs métier d'abord |

Aucune de ces pistes n'est un audit-only "faux problème" comme l'étaient
Multi-supplier Hub (chantier 7) ou Ranking (chantier 8) — chacune nécessite soit une
décision produit/business de votre part (B, D), soit un feu vert explicite et
prudent vu le risque (C), soit peut démarrer directement en code aujourd'hui (A).
