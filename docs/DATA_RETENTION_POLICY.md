# DATA-RETENTION-AND-DELETION-POLICY-01 — Politique de conservation et de suppression des données

> **Statut : PROJET — NON APPROUVÉ.** Aucune durée de conservation n'est fixée dans ce document. Chaque durée reste **À DÉCIDER** tant qu'elle n'a pas été validée par son responsable, avec sa source (obligation légale, contrat ou décision de la Direction). Ce document ne déclenche aucune suppression : toute purge automatique exige une fiche technique et un GO séparés.
>
> Créé le 2026-11-08 (inventaire lecture seule du code sur `main` et de la base de production `crygnaichvlxavvbifqi`). Périmètre : B2C, B2B, CRM, réservations, hôtels, vols, wallet, paiements, finances, fournisseurs, administration.

## 1. Comment lire ce document

Chaque famille de données porte six rubriques :

1. **Durée de conservation** — à partir de quel événement, combien de temps (À DÉCIDER tant que non validée).
2. **Responsable de la décision** — proposition, à confirmer par la Direction.
3. **Suppression ou anonymisation** — ce qui est autorisé une fois la durée écoulée ou sur demande de la personne.
4. **Conditions de blocage** — situations où rien ne doit être supprimé ni anonymisé, même à échéance ou sur demande.
5. **Preuves à conserver** — ce qui doit survivre à une suppression ou une anonymisation.
6. **Règles de purge automatique** — autorisée ou non, et à quelles conditions.

Une donnée n'est jamais supprimée parce qu'aucune règle ne la protège : en l'absence de décision, **on conserve**.

## 2. Principes transverses (proposés)

- **P1 — Écritures financières jamais supprimées.** `economic_entitlements` (append-only, migration 0092), `wallet_ledger`, `commission_settlement_entries` et les écritures comptables ne sont jamais modifiées ni supprimées. Une demande de suppression d'une personne se traite par **anonymisation de la personne**, jamais par suppression de l'écriture.
- **P2 — Anonymiser plutôt que supprimer** quand une ligne est reliée à une écriture financière, une facture ou un litige.
- **P3 — Mémoires techniques « déjà fait » protégées.** Certaines tables servent d'anti-doublon ou de rapprochement (`audit_events` : marqueur d'email de vol, index unique des notifications réussies, clé d'écart de rapprochement ; `notification_idempotency` ; `psp_webhooks` ; `payment_events`). Les purger peut provoquer des envois en double ou de faux écarts : toute purge les exclut sauf règle explicite.
- **P4 — Pas de purge sans preuve.** Une purge automatique n'est activée qu'avec : la règle validée, la liste des familles exclues dans le code, des tests sur PostgreSQL réel, et un comptage en lecture seule avant la première exécution en production.
- **P5 — Une seule source de vérité.** Les engagements publics (page de suppression des données) doivent reprendre exactement les durées validées ici.

## 3. État constaté (2026-11-08)

| Constat                                                                                                                                                                                              | Source                                                                                     | Conséquence                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Engagement public : suppression sous **5 jours** sur demande ; factures conservées **1 an** puis supprimées                                                                                          | `lib/legal/data-deletion-content.ts` (page `/suppression-donnees`, LEGAL-DATA-DELETION-01) | La durée de 1 an pour les factures n'a jamais été comparée aux obligations comptables et fiscales — **à valider en priorité** (voir §5). |
| **Aucun outil d'anonymisation** n'existe ; les demandes se traitent manuellement                                                                                                                     | même fichier, en-tête                                                                      | L'engagement de 5 jours repose sur une intervention humaine.                                                                             |
| Seule purge automatique existante : `/api/cron/purge-audit` (suppression de toute trace d'audit > 30 jours) — en échec depuis le 2026-09-20, **désactivée** par AUDIT-RETENTION-01 étape 1 (PR #347) | `app/api/cron/purge-audit/route.ts`                                                        | Aucune trace n'a jamais été purgée.                                                                                                      |
| Le cron `cleanup` ne supprime que les verrous de stock expirés (`inventory_locks`)                                                                                                                   | `app/api/cron/cleanup/route.ts`                                                            | Purge technique sans donnée personnelle.                                                                                                 |
| Volume actuel faible : `audit_events` = 47 lignes (plus ancienne : 2026-09-19), 3 droits économiques                                                                                                 | lecture production                                                                         | Aucune urgence de volume ; l'enjeu est la conformité.                                                                                    |
| Données hors schéma `public` non inventoriées ici : comptes d'authentification Supabase (`auth.users`), fichiers stockés (médias, pièces jointes)                                                    | —                                                                                          | À couvrir dans une révision (famille F02 et F05 notamment).                                                                              |

## 4. Familles de données

### F01 — Clients B2C et contenu publié par les clients

Tables : `customers`, `customer_favorites`, `loyalty_accounts`, `loyalty_ledger`, `reviews`.

1. **Durée** : À DÉCIDER (point de départ proposé : dernière activité du client ou dernière réservation).
2. **Responsable** : Direction + conseil juridique.
3. **Suppression / anonymisation** : anonymisation du client sur demande (nom, email, téléphone) ; favoris supprimables ; avis publiés : retrait ou anonymisation de l'auteur. Outil à construire.
4. **Blocage** : réservation non terminée, paiement ou remboursement en cours, solde wallet non nul, litige.
5. **Preuves** : date et objet de la demande de suppression, date de traitement, auteur du traitement ; mouvements de fidélité (`loyalty_ledger`) conservés sous forme anonymisée.
6. **Purge automatique** : non (traitement à la demande uniquement, tant que non décidé).

### F02 — Comptes professionnels, administration et accès

Tables : `users`, `agencies`, `permission_grants`, `product_authorizations`, `supplier_portal_users` (+ `auth.users`, hors schéma public).

1. **Durée** : À DÉCIDER (point de départ proposé : fin de la relation avec l'agence ou départ de l'utilisateur).
2. **Responsable** : Direction.
3. **Suppression / anonymisation** : désactivation immédiate des accès à la fin de la relation ; anonymisation de l'utilisateur ensuite. Une agence n'est jamais supprimée tant qu'elle porte des écritures (clés étrangères `ON DELETE RESTRICT`).
4. **Blocage** : écritures financières, factures ou règlements liés à l'agence ; enquête de sécurité.
5. **Preuves** : historique des droits accordés et retirés (qui, quand), traces des actions sensibles (`audit_events`).
6. **Purge automatique** : non.

### F03 — CRM, prospects et marketing

Tables : `leads`, `contacts`, `crm_conversations`, `crm_messages`, `crm_tasks`, `lead_consent_events`, `lead_origin_events`, `lead_relance_settings`, `lead_scoring_rules`, `campaigns`, `campaign_targets`, `campaign_attributions`, `development_project_waitlist`.

1. **Durée** : À DÉCIDER (point de départ proposé : dernier contact avec le prospect ; durée distincte pour un prospect jamais converti).
2. **Responsable** : responsable marketing/CRM + conseil juridique.
3. **Suppression / anonymisation** : suppression ou anonymisation du prospect et de ses messages sur demande ou à échéance. Les paramètres (`lead_relance_settings`, `lead_scoring_rules`, `campaigns`) ne contiennent pas de données personnelles.
4. **Blocage** : prospect devenu client (relève alors de F01), contestation d'un consentement en cours.
5. **Preuves** : `lead_consent_events` (preuve du consentement et de son retrait) — à conserver, au moins sous forme anonymisée, pour démontrer la licéité des envois passés ; désinscriptions.
6. **Purge automatique** : possible après décision (prospects inactifs), avec exclusion des preuves de consentement.

### F04 — Réservations et dossiers de voyage

Tables : `reservations`, `reservation_activity`, `reservation_car`, `reservation_flight`, `reservation_hotel`, `reservation_network_product`, `reservation_omra`, `reservation_package`, `reservation_transfer`, `reservation_status_history`, `reservation_validations`, `validation_comments`, `validation_history`, `journeys`, `journey_lines`, `inventory_locks`.

1. **Durée** : À DÉCIDER — doit être au moins égale à celle des factures et écritures liées (F06).
2. **Responsable** : Direction + expert-comptable.
3. **Suppression / anonymisation** : la réservation est conservée ; les données personnelles des voyageurs sont anonymisées à échéance (voir F05). `inventory_locks` : verrous techniques, purgés dès expiration (comportement actuel).
4. **Blocage** : réservation non terminée, remboursement ou compensation en cours (dont trace `entitlements.to_compensate`), litige, facture non prescrite.
5. **Preuves** : statuts et historique (`reservation_status_history`), montants, conditions d'annulation appliquées, lien vers la facture.
6. **Purge automatique** : non pour les réservations ; oui pour `inventory_locks` (déjà en place).

### F05 — Voyageurs, passagers et pièces

Tables : `omra_pilgrims`, `omra_room_allocations`, `flight_bookings`, `flight_booking_passengers`, `flight_booking_segments`, `flight_tickets`, `flight_orders`, `flight_ancillaries`, `mutuelle_requests`, `mutuelle_groups` (+ pièces jointes stockées, hors schéma public).

1. **Durée** : À DÉCIDER (point de départ proposé : fin du voyage). Données sensibles (pièces d'identité, passeports) : durée la plus courte possible, à fixer en priorité.
2. **Responsable** : conseil juridique + Direction.
3. **Suppression / anonymisation** : anonymisation des voyageurs après la fin du voyage et l'expiration des délais de réclamation ; billets et segments conservés sans données personnelles si nécessaires à la comptabilité.
4. **Blocage** : voyage non terminé, réclamation compagnie ou fournisseur, litige, contrôle administratif.
5. **Preuves** : numéros de billet et de commande fournisseur, montants, lien réservation ↔ facture.
6. **Purge automatique** : possible après décision, uniquement par anonymisation.

### F06 — Factures, comptabilité et droits économiques

Tables : `partner_invoices`, `journal_entries`, `journal_lines`, `reservation_financials`, `economic_entitlements`, `commission_settlements`, `commission_settlement_entries`.

1. **Durée** : À DÉCIDER **selon l'obligation légale comptable et fiscale tunisienne, à confirmer par l'expert-comptable**. L'engagement public actuel (factures 1 an) doit être confronté à cette obligation avant toute purge.
2. **Responsable** : expert-comptable + Direction.
3. **Suppression / anonymisation** : **jamais de suppression d'écriture** (P1). Anonymisation de la personne uniquement, si la loi le permet.
4. **Blocage** : toujours, pendant toute la durée légale.
5. **Preuves** : toutes les écritures, factures, lots de règlement, instantanés fiscaux (`reservations.fiscal_snapshot`).
6. **Purge automatique** : non.

### F07 — Wallet, paiements et crédit partenaire

Tables : `wallets`, `wallet_accounts`, `wallet_ledger`, `wallet_transactions`, `wallet_recharge_requests`, `customer_topup_requests`, `topup_payment_methods`, `payments`, `payment_events`, `psp_webhooks`, `partner_payments`, `partner_credit_movements`.

1. **Durée** : À DÉCIDER — au moins égale à F06 ; obligations éventuelles des prestataires de paiement (PSP) à vérifier dans leurs contrats.
2. **Responsable** : expert-comptable + Direction (contrats PSP).
3. **Suppression / anonymisation** : journal (`wallet_ledger`) et événements PSP jamais supprimés ; anonymisation du titulaire seulement. `topup_payment_methods` : paramétrage, sans donnée personnelle.
4. **Blocage** : solde non nul, recharge ou remboursement en cours, litige ou rejet bancaire, rapprochement non soldé.
5. **Preuves** : journal complet, références PSP, preuves de virement manuel.
6. **Purge automatique** : non. `psp_webhooks` et `payment_events` servent d'anti-doublon (P3).

### F08 — Fournisseurs, accords et identifiants

Tables : `suppliers`, `supplier_nodes`, `supplier_modules`, `supplier_settlements`, `supplier_settlement_entries`, `hotel_suppliers`, `hotel_supplier_accounts`, `hotel_supplier_authorizations`, `hotel_supplier_credentials`, `flight_supplier_configs`, `flight_supplier_credentials`, `flight_supplier_transactions`, `commercial_agreements`, `margin_rules`, `canonical_hotel_supplier_mappings`.

1. **Durée** : À DÉCIDER (point de départ proposé : fin du contrat fournisseur) ; règlements fournisseur alignés sur F06.
2. **Responsable** : Direction.
3. **Suppression / anonymisation** : **identifiants d'accès fournisseur révoqués et supprimés dès la fin du contrat** ; accords et règlements conservés.
4. **Blocage** : règlement fournisseur ouvert, dette ou trop-perçu, litige contractuel.
5. **Preuves** : accords commerciaux et règles de marge appliquées, règlements et justificatifs, transactions fournisseur vols.
6. **Purge automatique** : non (sauf révocation des identifiants, déclenchée par la fin de contrat).

### F09 — Traces techniques, journaux et signaux

Tables : `audit_events`, `audit_logs`, `api_logs`, `supplier_logs`, `notification_idempotency`, `flight_searches`, `flight_price_snapshots`, `search_demand_signals`, `market_signals`.

1. **Durée** : À DÉCIDER **par sous-famille** (D1 d'AUDIT-RETENTION-01). L'ancienne règle « 30 jours pour tout `audit_events` » n'a jamais été validée.
2. **Responsable** : Direction + responsable technique.
3. **Suppression / anonymisation** : purge possible pour les journaux d'appels fournisseurs (`api_logs`, `supplier_logs`) et les recherches (`flight_searches`, `search_demand_signals`) après décision.
4. **Blocage** (D2 d'AUDIT-RETENTION-01, liste minimale proposée) : traces liées à une réservation, un paiement, des droits économiques, un rapprochement, une notification réussie, un utilisateur ou une permission, une agence ; `notification_idempotency` (anti-doublon) ; `flight_price_snapshots` liés à une réservation (preuve du coût fournisseur figé utilisé par les droits économiques des vols).
5. **Preuves** : traces des actions sensibles (droits, paiements, annulations, compensations).
6. **Purge automatique** : oui **après décision** et seulement pour les sous-familles autorisées (AUDIT-RETENTION-01 étape 2).

### F10 — Catalogue, contenu public et paramétrage

Tables : `products`, `product_media`, `product_inventory`, `catalog_activities`, `catalog_activity_sessions`, `catalog_drivers`, `catalog_package_departures`, `catalog_packages`, `catalog_transfer_pricing`, `catalog_transfer_zones`, `catalog_vehicles`, `car_availability`, `car_categories`, `car_fleet_vehicles`, `car_locations`, `car_pricing_rates`, `omra_packages`, `omra_allotments`, `omra_flights`, `omra_hotels`, `mutuelle_catalog_items`, `destinations`, `destination_external_refs`, `canonical_hotels`, `development_projects`, `public_module_visuals`, `public_promotions`, `public_site_settings`, `promos`, `currencies`, `exchange_rates`, `fx_policies`, `fiscal_rules`, `cancellation_policies`, `pricing_margins`, `yield_rules`, `hotel_commercial_rules`, `flight_commercial_rules`.

1. **Durée** : pas de durée liée aux personnes ; conservation tant qu'utile. Paramètres fiscaux, taux de change et règles commerciales : conserver les versions ayant servi à une réservation (preuve du prix appliqué).
2. **Responsable** : Direction.
3. **Suppression / anonymisation** : suppression libre des contenus obsolètes non référencés. **Exception données personnelles** : `catalog_drivers` (chauffeurs) relève des règles F02/F05.
4. **Blocage** : élément référencé par une réservation, une facture ou un instantané fiscal.
5. **Preuves** : versions des taux, règles fiscales et conditions d'annulation appliquées.
6. **Purge automatique** : non.

## 5. Décisions attendues (par priorité)

| #   | Décision                                                                  | Responsable proposé   | Pourquoi en priorité                                                                 |
| --- | ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| 1   | Durée légale de conservation des factures et écritures (F06, F07)         | Expert-comptable      | L'engagement public « factures 1 an » est peut-être contraire à l'obligation légale. |
| 2   | Durée de conservation des pièces d'identité et données de voyageurs (F05) | Conseil juridique     | Données les plus sensibles.                                                          |
| 3   | Durées par sous-famille de traces techniques + liste d'exclusion (F09)    | Direction + technique | Débloque AUDIT-RETENTION-01 étape 2.                                                 |
| 4   | Durées clients B2C et prospects CRM (F01, F03)                            | Direction + juridique | Cohérence avec la page de suppression (5 jours).                                     |
| 5   | Fin de relation agence / fournisseur (F02, F08)                           | Direction             | Révocation des accès et identifiants.                                                |

## 6. Couverture de l'inventaire

130 tables du schéma `public` en production (128 déclarées dans le schéma Drizzle + `supplier_settlements` et `supplier_settlement_entries`, créées par migration manuelle 0135). Chaque table est rattachée à exactement une famille ci-dessus. Le test `lib/legal/__tests__/data-retention-policy-coverage.test.ts` vérifie qu'aucune table du schéma Drizzle n'est oubliée.

Hors périmètre de cette version (à ajouter) : `auth.users` (authentification Supabase), fichiers stockés (médias, pièces jointes), sauvegardes de base de données, journaux des hébergeurs (Vercel, Supabase), données détenues par Meta/Instagram (relèvent de leurs propres paramètres).

## 7. Suites techniques (chacune sur fiche et GO séparés)

- **AUDIT-RETENTION-01 étape 2** — purge limitée des traces techniques (après décision n° 3).
- **ANONYMIZATION-TOOL-01** — outil d'anonymisation d'un client / voyageur / prospect, respectant les blocages et P1.
- **LEGAL-RETENTION-ALIGN-01** — mise en cohérence de la page publique de suppression avec les durées validées.
