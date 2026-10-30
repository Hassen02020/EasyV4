# CRM Easy2Book — Cartographie et registre des écarts (CRM-E2B-P0)

> Phase 0 de la feuille de route CRM-E2B. Établi le 2026-10-30, en lecture seule
> (code de `main` au commit `5f8ff47a` + PR #299 en cours, base de production
> `crygnaichvlxavvbifqi` en lecture seule, journaux Vercel de production).
>
> **Règle appliquée : une fonction déclarée dans le code n'est pas une fonction
> opérationnelle.** Le statut « Prouvé en réel » n'est accordé qu'avec une preuve
> de production (données, journaux ou test réel), jamais sur la seule base du
> code, d'une page qui s'affiche ou d'un test statique.

## 1. Légende des statuts

Chaque fonction reçoit 6 statuts.

| Colonne    | Signification                 | Preuve exigée                                                                                                                                         |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**   | Présente dans le code         | fichier:ligne                                                                                                                                         |
| **UI**     | Reliée à une interface        | page + contrôle qui l'appelle                                                                                                                         |
| **DB**     | Reliée à la base              | tables lues/écrites ; droits `app_runtime` en production                                                                                              |
| **Test**   | Testée                        | **R** = test réel PostgreSQL en CI · **r** = test réel hors CI · **U** = unitaire · **S** = statique seulement (lit le texte du code) · **—** = aucun |
| **Réel**   | Prouvée en environnement réel | donnée ou journal de production daté                                                                                                                  |
| **Défaut** | Manquante ou défectueuse      | écart du registre (§9)                                                                                                                                |

Valeurs : ✅ oui · ⚠️ partiel · ❌ non · — sans objet.

## 2. État de la production au 2026-10-30 (lecture seule)

| Table                                                              | Lignes | Commentaire                                                                            |
| ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `leads`                                                            | 3      | 2 prospects de test site (30/10, dont 1 via landing avec `campaign_ref`) + 1 antérieur |
| `contacts`                                                         | 3+     | issus des prospects de test                                                            |
| `lead_consent_events`                                              | 6      | 3 par prospect test avec consentement                                                  |
| `lead_origin_events`                                               | 2      |                                                                                        |
| `campaigns`, `campaign_targets`, `campaign_attributions`, `promos` | 0      | **aucune campagne n'a jamais existé en production**                                    |
| `crm_conversations`, `crm_messages`                                | 0      | **aucun canal de messagerie n'a jamais reçu de message**                               |
| `crm_tasks`, `lead_relance_settings`, `lead_scoring_rules`         | 0      | jamais utilisés (valeurs par défaut du code)                                           |
| `search_demand_signals`                                            | 3      |                                                                                        |
| `customers`                                                        | 3      |                                                                                        |
| `loyalty_accounts` / `loyalty_ledger`                              | 1 / 0  |                                                                                        |
| `reservations`                                                     | 4      | hôtel (annulée, expirées), hôtel monde (en attente) ; aucune confirmée                 |

Configuration de production (noms de variables, sans valeurs) :

- **Présentes** depuis le 30/10 : `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`. App Inngest synchronisée (13:10 UTC). Domaine `easy2book.tn` vérifié chez Resend (15:06).
- **Absentes** : `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_LEADADS_VERIFY_TOKEN`, `META_INSTAGRAM_VERIFY_TOKEN`, `META_MESSENGER_VERIFY_TOKEN`, `WHATSAPP_*`, `RESEND_INBOUND_SECRET`, `UPSTASH_REDIS_REST_*`.

Droits réels du rôle `app_runtime` et RLS en production (requête `has_table_privilege` + `pg_class`) :

| Table                                      | SELECT | INSERT | UPDATE | DELETE | RLS / FORCE | Politiques        |
| ------------------------------------------ | ------ | ------ | ------ | ------ | ----------- | ----------------- |
| leads                                      | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 1                 |
| contacts                                   | ✅     | ✅     | ✅     | ❌     | ✅ / ✅     | 1                 |
| lead_consent_events                        | ✅     | ✅     | ❌     | ❌     | ✅ / ✅     | 1                 |
| lead_origin_events                         | ✅     | ✅     | ❌     | ❌     | ✅ / ✅     | 1                 |
| campaigns                                  | ✅     | ✅     | ✅     | ❌     | ✅ / ✅     | 1                 |
| **campaign_targets**                       | ✅     | ✅     | **❌** | ❌     | ✅ / ✅     | 1                 |
| campaign_attributions                      | ✅     | ✅     | ❌     | ❌     | ✅ / ✅     | 1                 |
| promos                                     | ✅     | ✅     | ✅     | ❌     | ✅ / ✅     | 1                 |
| crm_tasks                                  | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 3 (pas de DELETE) |
| crm_conversations / crm_messages           | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 1                 |
| lead_relance_settings / lead_scoring_rules | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 1                 |
| search_demand_signals                      | ✅     | ✅     | ✅     | ❌     | ✅ / ✅     | 1                 |
| loyalty_accounts                           | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 1                 |
| **loyalty_ledger**                         | ✅     | ✅     | **✅** | **✅** | ✅ / ✅     | 1                 |
| customers                                  | ✅     | ✅     | ✅     | ✅     | ✅ / ✅     | 1                 |
| **notification_idempotency**               | ✅     | ✅     | ❌     | ❌     | ✅ / **❌** | 1                 |
| audit_events                               | ✅     | ✅     | ❌     | ✅     | ✅ / ✅     | 1                 |

## 3. Interfaces CRM

Les pages CRM sont réservées au staff : rôles super_admin, manager, agent_resa d'une agence OTA (`assertSupportStaff`, dupliqué dans chaque fichier d'actions, ex. `lib/admin/leads-actions.ts:34-58`). Aucune donnée fictive (mock, lorem, TODO) n'a été trouvée dans l'interface CRM.

| Page                               | Fichier                                         | Contenu                                                                                             | Contrôles                                                                   | Navigation                     |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `/admin/support`                   | `app/(internal)/admin/support/page.tsx`         | prospects (table + pipeline), statistiques, tâches, boîte de réception, réglages scoring et relance | tous réels (voir §4)                                                        | ✅ menu                        |
| `/admin/analytics`                 | `analytics/page.tsx`                            | grille de 13 liens                                                                                  | —                                                                           | ✅                             |
| `/admin/analytics/niches`          | `niches/page.tsx`                               | segments de niche                                                                                   | lecture seule                                                               | ✅                             |
| `/admin/analytics/search-demand`   | `search-demand/page.tsx`                        | demande de recherche 30 j                                                                           | lecture seule                                                               | ✅                             |
| `/admin/analytics/campaigns`       | `campaigns/page.tsx`                            | performance, cibles, annulation                                                                     | réels                                                                       | ✅                             |
| `/admin/analytics/conversion`      | `conversion/page.tsx`                           | entonnoir canal × produit                                                                           | lecture seule                                                               | ✅                             |
| `/admin/analytics/trends`          | `trends/page.tsx`                               | tendances 4/8/12 semaines                                                                           | réels                                                                       | ✅                             |
| `/admin/analytics/radar`           | `radar/page.tsx`                                | radar métier                                                                                        | réels                                                                       | ✅                             |
| `/admin/analytics/vip`             | `vip/page.tsx`                                  | top VIP                                                                                             | lecture seule, sans lien vers la fiche                                      | ✅                             |
| `/admin/analytics/signal`          | `signal/page.tsx`                               | moteur de signaux                                                                                   | réels                                                                       | ✅                             |
| `/admin/analytics/action`          | `action/page.tsx`                               | actions recommandées                                                                                | **aucune exécution possible** (texte « exécutables »)                       | ✅                             |
| `/admin/analytics/learning`        | `learning/page.tsx`                             | conversion par tranche VIP                                                                          | réels                                                                       | ✅                             |
| `/admin/analytics/campaign-engine` | `campaign-engine/page.tsx`                      | propositions de campagne → « Créer & lancer »                                                       | réel, **sans édition ni confirmation, sans anti-doublon**                   | ✅                             |
| `/admin/b2c/clients` (+ `[id]`)    | `b2c/clients/page.tsx`                          | clients B2C                                                                                         | **recherche sans effet** (:190) ; statistiques calculées sur 100 lignes max | ✅ (absent du menu agent_resa) |
| `/[locale]/landing/[slug]`         | `app/(public)/[locale]/landing/[slug]/page.tsx` | 5 landing pages                                                                                     | formulaire réel                                                             | par URL de campagne uniquement |
| Formulaire prospect public         | `components/leads/lead-capture-form.tsx`        | 5 pages                                                                                             | réel ; `intention` figée à `standard` (:73)                                 | —                              |
| `/compte` fidélité                 | `components/compte/compte-loyalty-*.tsx`        | solde, historique, utilisation des points                                                           | réel (registre seulement)                                                   | ✅                             |

**Fonctions sans interface** : création et édition de promotions (`lib/crm/promo-core.ts:70,148`), consultation et retrait du consentement (`lib/crm/consent-core.ts:155`), audience de niche (`lib/admin/niche-actions.ts:85`), « mes tâches » (`lib/admin/task-actions.ts:53`), édition d'une campagne avant lancement, administration de la fidélité, champ produit à la création manuelle d'un prospect.

## 4. Matrice des fonctions (6 statuts)

### 4.1 Socle : prospects, contacts, consentement (Phase 1)

| Fonction                                                                                                    | Code                  | UI                   | DB                                  | Test                                 | Réel                                                       | Défaut                                     |
| ----------------------------------------------------------------------------------------------------------- | --------------------- | -------------------- | ----------------------------------- | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| Capture prospect formulaire site (`submitLead`, `app/actions/submit-lead.ts:60` → `captureWebsiteLeadCore`) | ✅                    | ✅ 5 pages + landing | ✅ leads, origin, contacts, consent | R (`website-lead-capture-core-live`) | ✅ **prospects du 30/10 (05:35 et 13:12)**                 | G-14, G-20                                 |
| Attribution campagne par URL (`?utm_campaign=`)                                                             | ✅                    | ✅ landing           | ✅ `leads.campaign_ref`             | U+S                                  | ✅ **`campaign_ref` renseigné le 30/10 13:12**             | G-21 (ponctuation non nettoyée)            |
| Attribution campagne multi-pages (sessionStorage)                                                           | ✅                    | ✅                   | ✅                                  | U                                    | ❌ **échec constaté** (`campaign_ref` NULL le 30/10 05:35) | G-22                                       |
| Contact normalisé (`resolveOrCreateContactCore`)                                                            | ✅                    | —                    | ✅ unique (agence, canal, réf.)     | R                                    | ✅ 3 contacts                                              | —                                          |
| Consentement marketing explicite (case non cochée par défaut)                                               | ✅                    | ✅                   | ✅ append-only                      | R                                    | ✅ 3 évènements email/WhatsApp/appel                       | —                                          |
| Retrait du consentement                                                                                     | ❌                    | ❌                   | ✅ (valeur prévue)                  | —                                    | ❌                                                         | **G-08**                                   |
| Origine du prospect (`lead_origin_events`)                                                                  | ✅                    | —                    | ✅ append-only                      | R                                    | ✅                                                         | —                                          |
| Création manuelle par le staff (`createLead`, `leads-actions.ts:224`)                                       | ✅                    | ✅                   | ✅                                  | S                                    | ❌                                                         | G-19 (pas de produit, pas de consentement) |
| Statut, conversion, notes (`updateLeadStatus`, `convertLead`, `updateLeadNotes`)                            | ✅                    | ✅                   | ✅                                  | S / r                                | ❌                                                         | G-23 (vues non synchronisées)              |
| Recherche de réservations à lier                                                                            | ✅                    | ✅                   | ✅                                  | —                                    | ❌                                                         | —                                          |
| Détection des doublons de prospects                                                                         | ⚠️ contacts seulement | —                    | ⚠️ pas d'unicité clients            | r                                    | ❌                                                         | G-15                                       |
| Journalisation des changements de prospects                                                                 | ⚠️                    | —                    | ⚠️                                  | —                                    | ❌                                                         | G-24                                       |
| Isolation RLS des tables CRM                                                                                | ✅                    | —                    | ✅ RLS+FORCE (sauf idempotence)     | r (`rls-force-crm-01-live`, hors CI) | ✅ **vérifié en base**                                     | G-11, G-12, G-13                           |

### 4.2 Canaux d'acquisition (Phase 2)

| Fonction                                                | Code | UI       | DB  | Test                              | Réel                                                                                 | Défaut              |
| ------------------------------------------------------- | ---- | -------- | --- | --------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| Formulaire site                                         | ✅   | ✅       | ✅  | R                                 | ✅                                                                                   | —                   |
| Landing pages (5)                                       | ✅   | ✅       | ✅  | U+S                               | ✅ (omra, 30/10)                                                                     | —                   |
| Notification équipe nouveau prospect (`processNewLead`) | ✅   | —        | —   | S seulement                       | ⚠️ **déclenchée en réel le 30/10, échec à l'envoi (clé Resend), relance en attente** | G-03, G-25, G-26    |
| Facebook Lead Ads (`/api/webhooks/meta-leadads`)        | ✅   | —        | ✅  | r (cœur seulement)                | ❌ **non configuré** (variables Meta absentes)                                       | G-04, G-05, G-17    |
| WhatsApp entrant (`/api/webhooks/whatsapp`)             | ✅   | ✅ inbox | ✅  | U / r (cœur, hors CI)             | ❌ non configuré                                                                     | G-04, G-27          |
| Instagram (`/api/webhooks/instagram`)                   | ✅   | ✅ inbox | ✅  | S                                 | ❌ non configuré                                                                     | G-04, G-27          |
| Messenger (`/api/webhooks/messenger`)                   | ✅   | ✅ inbox | ✅  | S                                 | ❌ non configuré                                                                     | G-04, G-27          |
| Email entrant (`/api/webhooks/resend-inbound`)          | ✅   | —        | ✅  | S                                 | ❌ non configuré                                                                     | G-04, G-16          |
| Réponse depuis la boîte de réception (`sendReply`)      | ✅   | ✅       | ✅  | S                                 | ❌                                                                                   | G-28                |
| Agences et partenaires (origine `network`)              | ✅   | ✅ /pro  | ✅  | R (`network-demand-capture-live`) | ❌                                                                                   | —                   |
| Campagnes publicitaires (Meta Ads)                      | ❌   | ❌       | ❌  | —                                 | ❌                                                                                   | hors code (Phase 6) |

### 4.3 Intelligence commerciale (Phase 3)

| Fonction                                                       | Code | UI  | DB                                          | Test  | Réel                      | Défaut                                |
| -------------------------------------------------------------- | ---- | --- | ------------------------------------------- | ----- | ------------------------- | ------------------------------------- |
| Segments de niche (marché × produit × intention × destination) | ✅   | ✅  | lecture leads                               | U + R | ❌ (3 prospects)          | G-29 (intention figée, marché unique) |
| Segmentation par région                                        | ❌   | ❌  | ❌ (aucune donnée région sur les prospects) | —     | ❌                        | **G-30**                              |
| Segmentation par période de voyage / budget                    | ❌   | ❌  | ❌                                          | —     | ❌                        | G-30                                  |
| Demande de recherche                                           | ✅   | ✅  | ✅                                          | R     | ⚠️ 3 signaux              | —                                     |
| Entonnoir de conversion                                        | ✅   | ✅  | lecture                                     | U     | ❌                        | —                                     |
| Tendances / radar / signaux / apprentissage                    | ✅   | ✅  | lecture                                     | U     | ❌                        | G-31 (textes trompeurs)               |
| Scoring prospects (règles réglables)                           | ✅   | ✅  | ✅                                          | U + r | ❌ (aucune règle en base) | G-32 (seuils incohérents)             |
| Score VIP                                                      | ✅   | ✅  | lecture                                     | U + R | ❌                        | G-33 (calcul ligne à ligne)           |

### 4.4 Campagnes et automatisation (Phase 4)

| Fonction                                               | Code               | UI          | DB                                 | Test                              | Réel                                                    | Défaut               |
| ------------------------------------------------------ | ------------------ | ----------- | ---------------------------------- | --------------------------------- | ------------------------------------------------------- | -------------------- |
| Propositions de campagne                               | ✅                 | ✅          | lecture                            | U                                 | ❌                                                      | —                    |
| Créer et lancer (`createAndLaunchCampaign`)            | ✅                 | ✅          | ✅                                 | R (cœur) / S (action)             | ❌ 0 campagne                                           | G-02, G-09, G-34     |
| Filtre consentement au lancement et à l'envoi          | ✅                 | —           | ✅                                 | R                                 | ❌                                                      | G-35                 |
| Livraison email (`deliverCampaign`)                    | ✅                 | —           | ❌ **UPDATE refusé en production** | U (succès en `test.skip`)         | ❌                                                      | **G-01**, G-07, G-36 |
| Livraison WhatsApp                                     | ⚠️                 | —           | —                                  | U                                 | ❌ toujours ignorée (`TEMPLATE_NOT_CONFIGURED`)         | G-37                 |
| Livraison appel                                        | ⚠️                 | —           | —                                  | U                                 | ❌ toujours ignorée (non automatisable)                 | —                    |
| Annulation (`cancelCampaign`)                          | ✅                 | ✅          | ✅                                 | S + R (cœur)                      | ❌                                                      | **G-06**             |
| Arrêt / pause / clôture                                | ❌                 | ❌          | statut prévu, jamais écrit         | —                                 | ❌                                                      | G-38                 |
| Promotions liées à une campagne                        | ⚠️ cœur + checkout | ❌ création | ✅                                 | R                                 | ❌                                                      | G-39                 |
| Tâches commerciales                                    | ✅                 | ✅          | ✅                                 | S                                 | ❌ 0 tâche                                              | G-40                 |
| Relance quotidienne des prospects (`notifyStaleLeads`) | ✅                 | ✅ réglages | lecture                            | ❌ (fonction) / U (`isLeadStale`) | ❌ (aucun réglage en base ⇒ ne s'exécute pour personne) | G-41                 |
| Désinscription dans les emails de campagne             | ❌                 | —           | —                                  | —                                 | ❌                                                      | **G-10**             |

### 4.5 Réservations et revenus (Phase 5)

| Fonction                                             | Code         | UI             | DB        | Test      | Réel                                             | Défaut     |
| ---------------------------------------------------- | ------------ | -------------- | --------- | --------- | ------------------------------------------------ | ---------- |
| Lien prospect → réservation (manuel)                 | ✅           | ✅             | ✅ unique | S + r     | ❌                                               | —          |
| Auto-conversion à la réservation (`autoConvertLead`) | ✅           | —              | ✅        | **aucun** | ❌                                               | G-42, G-43 |
| Attribution campagne → réservation (cron 06:00)      | ✅           | ✅ performance | ✅ unique | R (cœur)  | ❌ (0 campagne)                                  | G-44, G-45 |
| Performance campagne (revenu, marge)                 | ✅           | ✅             | lecture   | R + U     | ❌                                               | —          |
| Synchronisation CRM externe (`syncBookingCrm`)       | ⚠️ coquille  | —              | audit     | U         | ❌ **fournisseur codé en dur « non configuré »** | G-46       |
| Émission fiable de `booking/confirmed` (hôtel)       | ✅ (PR #299) | —              | —         | S         | ❌                                               | G-43       |

### 4.6 Meta Pixel et Conversions API (Phase 6)

| Fonction                                           | Code | UI  | DB  | Test | Réel | Défaut                                                             |
| -------------------------------------------------- | ---- | --- | --- | ---- | ---- | ------------------------------------------------------------------ |
| Pixel navigateur / CAPI / déduplication `event_id` | ❌   | —   | —   | —    | ❌   | hors code ; dataset « landing page » existant chez Meta, non relié |

### 4.7 Fidélisation et client 360° (Phase 7)

| Fonction                               | Code             | UI            | DB      | Test        | Réel                     | Défaut                                  |
| -------------------------------------- | ---------------- | ------------- | ------- | ----------- | ------------------------ | --------------------------------------- |
| Vue client 360                         | ✅               | ✅ (dialogue) | lecture | r + S       | ❌                       | G-47 (pas reliée à la fiche client B2C) |
| Comptes de fidélité, gain, utilisation | ✅               | ✅ /compte    | ✅      | r (hors CI) | ⚠️ 1 compte, 0 mouvement | **G-12**                                |
| Expiration des points (cron 05:00)     | ✅               | —             | ✅      | r (hors CI) | ❌                       | —                                       |
| Clients VIP / réactivation / inactifs  | ⚠️ VIP seulement | ⚠️            | lecture | U           | ❌                       | G-48                                    |
| Parrainage                             | ❌               | ❌            | ❌      | —           | ❌                       | non prévu dans le code                  |

### 4.8 Pilotage (Phase 8)

Tableaux existants : performance de campagne, entonnoir de conversion, tendances, radar, VIP, demande de recherche. **Aucun n'est prouvé en réel** (données de production quasi vides). Absents : coût d'acquisition, performance des conseillers et des partenaires, valeur client.

## 5. Actions serveur et API (sécurité)

- **Actions staff** : toutes passent par `assertSupportStaff` puis `withTenantContext` (RLS active). Écart : copiée dans environ 19 fichiers ; `b2c-clients-actions.ts:65-73` omet le contrôle `agencyType === "ota"`.
- **Points d'entrée publics** (`submitLead`, webhooks) : tous exécutent avec `isSuperAdmin: true`, donc RLS contournée ; l'isolation repose sur les filtres `agencyId` du code (G-13). L'agence vient de l'hôte de la requête, pas du payload (`page_id`, `phone_number_id` ignorés).
- **Webhooks Meta et WhatsApp** : signature HMAC-SHA256 en temps constant. Jeton de vérification comparé avec `===`.
- **Webhook email entrant** : jeton Bearer statique, sans signature Resend ni déduplication (G-16).
- **Cron d'attribution** : secret accepté en paramètre d'URL `?secret=` (G-18).

## 6. Tâches automatiques

| Tâche                 | Déclencheur             | Émetteur                  | Fiabilité de l'émission                                                | Réel                            |
| --------------------- | ----------------------- | ------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `processNewLead`      | `crm/lead.created`      | formulaire site seulement | ✅ fiable ; **4 autres voies de création ne l'émettent jamais** (G-03) | ⚠️ déclenchée, envoi à relancer |
| `deliverCampaign`     | `crm/campaign.launched` | lancement de campagne     | ❌ `sendEvent().catch(log)` (G-02)                                     | ❌                              |
| `autoConvertLead`     | `booking/confirmed`     | hôtel seulement           | ✅ (avec PR #299)                                                      | ❌                              |
| `syncBookingCrm`      | `booking/confirmed`     | hôtel seulement           | ✅                                                                     | ❌ (coquille)                   |
| `notifyStaleLeads`    | cron Inngest 08:00 UTC  | —                         | —                                                                      | ❌                              |
| Attribution campagnes | cron Vercel 06:00       | —                         | —                                                                      | ❌                              |
| Expiration fidélité   | cron Vercel 05:00       | —                         | —                                                                      | ❌                              |

## 7. Tests

- 42 fichiers dans `lib/crm/__tests__` et environ 30 ailleurs touchent le CRM.
- **14 fichiers réels sont dans le job CI `financial-e2e`** et s'exécutent sur PostgreSQL.
- **9 fichiers réels ne s'exécutent jamais en CI** (ils se désactivent sans base) : `leads-core`, `inbox-core`, `lead-relance-core`, `lead-scoring-core`, `contact-history-core`, `loyalty/rewards-core`, `customer-360-core-live`, `search-demand-actions-live`, `db/rls-force-crm-01-live` (G-49).
- **Sans aucun test** : `autoConvertLead` (fonction et cœur), `notifyStaleLeads` (fonction), routes webhooks Meta Lead Ads et WhatsApp, route cron d'attribution, actions de réglage relance et scoring, envoi d'email de campagne.
- **Tests trompeurs** : `lead-relance-cron-invariants` teste une copie locale de la fonction ; le cas « succès » de `campaign-delivery-core` est désactivé (`test.skip`) avec deux assertions toujours vraies ; `campaign-lifecycle` ne vérifie que l'export (G-50).

## 8. Schéma de base (constats structurels)

- **Double création des tables CRM** : `drizzle/0011_quiet_stark_industries.sql` recrée sans RLS les tables des migrations manuelles. Risque sur une base neuve (G-51).
- **Contraintes déclarées en migration mais absentes du schéma Drizzle** (CHECK des prospects, fidélité, conversations…), et contraintes de valeur manquantes (canal, marché, intention, rôle, montants de promo, dates de campagne) (G-52).
- **Clés étrangères bloquantes** (`campaign_attributions` → campagne, contact, réservation en NO ACTION) et conflit `leads.reservation_id SET NULL` contre `leads_converted_requires_reservation` (G-53).

## 9. Registre des écarts

Priorités : **P0** = bloquant ou dangereux dès l'utilisation · **P1** = fiabilité, conformité · **P2** = qualité, complétude · **P3** = cosmétique.

| ID       | Écart                                                                                                                                                                                                                               | Preuve                                                                                                          | Phase | Prio                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----- | --------------------- |
| **G-01** | `app_runtime` n'a **pas le droit UPDATE sur `campaign_targets`** ; la livraison envoie l'email puis échoue sur la mise à jour ; transaction annulée, 3 relances : **le 1er destinataire reçoit jusqu'à 4 emails, les autres aucun** | production `has_table_privilege`=false ; `drizzle/manual/0114:88` ; `lib/crm/campaign-delivery-core.ts:152-186` | P4    | **P0**                |
| **G-06** | Une campagne annulée peut encore être livrée (statut jamais vérifié à l'envoi)                                                                                                                                                      | `campaign-delivery-core.ts:66` ; `campaign-persistence-core.ts:303-311`                                         | P4    | **P0**                |
| **G-10** | Emails de campagne sans lien ni en-tête de désinscription                                                                                                                                                                           | `lib/email/templates/campaign-email.ts`                                                                         | P4    | **P0** (conformité)   |
| G-02     | Lancement de campagne émis sans garantie (`sendEvent().catch(log)`) : campagne `active` jamais livrée, sans trace                                                                                                                   | `lib/admin/campaign-lifecycle-actions.ts:140-146`                                                               | P4    | P1                    |
| G-03     | `crm/lead.created` émis seulement par le formulaire site : aucune notification pour Lead Ads, WhatsApp, Instagram, Messenger, email entrant, création staff                                                                         | `submit-lead.ts:120` seul émetteur                                                                              | P2    | P1                    |
| G-04     | Canaux Meta, WhatsApp et email entrant non configurés en production                                                                                                                                                                 | variables absentes                                                                                              | P2    | P1 (config)           |
| G-05     | Lead Ads : prospect perdu (réponse 200) si le jeton Meta manque ou si Graph échoue                                                                                                                                                  | `meta-leadads/route.ts:104-113,134`                                                                             | P2    | P1                    |
| G-07     | Relances de livraison inutiles : les cibles en échec passent `failed` et ne sont jamais reprises ; risque de double envoi si la transaction est annulée                                                                             | `campaign-delivery-core.ts:163,182-185` ; `deliver-campaign.ts:48,60-68`                                        | P4    | P1                    |
| G-08     | Aucun moyen de retirer un consentement (ni UI ni action)                                                                                                                                                                            | `consent-core.ts`                                                                                               | P1    | P1 (RGPD)             |
| G-09     | Pas d'anti-doublon au lancement depuis le moteur de campagnes (rechargement ⇒ relance)                                                                                                                                              | `campaign-engine/page.tsx:65`                                                                                   | P4    | P1                    |
| G-11     | `notification_idempotency` sans FORCE RLS                                                                                                                                                                                           | production `relforcerowsecurity`=false                                                                          | P1    | P2                    |
| G-12     | `loyalty_ledger` documenté append-only mais `app_runtime` garde UPDATE et DELETE                                                                                                                                                    | production `has_table_privilege` ; `0039`                                                                       | P7    | P1 (financier)        |
| G-13     | Points d'entrée publics en `isSuperAdmin: true` : RLS contournée, isolation par le code seulement                                                                                                                                   | `submit-lead.ts:97`, webhooks                                                                                   | P1    | P2                    |
| G-14     | Rate-limit du formulaire en mémoire par instance (Upstash absent)                                                                                                                                                                   | `lib/rate-limit.ts`                                                                                             | P1    | P2                    |
| G-15     | Pas d'unicité clients (email, téléphone) ; doublons possibles                                                                                                                                                                       | `schema.ts:492-496`                                                                                             | P1    | P2                    |
| G-16     | Email entrant : pas de signature Resend, pas de déduplication                                                                                                                                                                       | `resend-inbound/route.ts:13-20,53-77`                                                                           | P2    | P2                    |
| G-17     | Lead Ads : idempotence par sélection puis insertion sans index unique (course)                                                                                                                                                      | `lead-capture-core.ts:60-75`                                                                                    | P2    | P2                    |
| G-18     | Secret du cron d'attribution accepté en paramètre d'URL, comparaison non constante                                                                                                                                                  | `attribute-campaign-conversions/route.ts:28-35`                                                                 | P5    | P2                    |
| G-19     | Création manuelle d'un prospect : pas de produit, pas de consentement                                                                                                                                                               | `create-lead-dialog.tsx`, `staff-lead-capture-core.ts:57`                                                       | P1    | P2                    |
| G-20     | HTML non échappé dans les emails internes (nom, contact, produit)                                                                                                                                                                   | `process-new-lead.ts:80-113` ; `notify-stale-leads.ts:51-58`                                                    | P1    | P1 (sécurité)         |
| G-21     | Code campagne de l'URL non nettoyé (`test-setup-01.`)                                                                                                                                                                               | production 30/10                                                                                                | P2    | P3                    |
| G-22     | Attribution perdue sur parcours multi-onglets ou webview (sessionStorage)                                                                                                                                                           | production 30/10 05:35                                                                                          | P2    | P2                    |
| G-23     | Table, pipeline et statistiques non synchronisés après un changement de statut                                                                                                                                                      | `leads-table.tsx:459-494`                                                                                       | P1    | P3                    |
| G-24     | Pas d'historique des changements de prospects (statut, notes)                                                                                                                                                                       | —                                                                                                               | P1    | P2                    |
| G-25     | `processNewLead` : erreur Resend non relancée ; aucune idempotence                                                                                                                                                                  | `process-new-lead.ts:144-151`                                                                                   | P2    | P2                    |
| G-26     | `processNewLead` couvert uniquement par des tests statiques                                                                                                                                                                         | §7                                                                                                              | P2    | P2                    |
| G-27     | Messagerie : échos Meta non filtrés, identifiant Meta stocké comme téléphone, messages non texte ignorés, mise à jour avant déduplication                                                                                           | `inbox-core.ts:189-221,279-285`                                                                                 | P2    | P2                    |
| G-28     | `sendReply` sans contrôle de consentement (fenêtre 24 h seulement) ; échec affiché si la base échoue après envoi                                                                                                                    | `inbox-actions.ts:204,216-283`                                                                                  | P4    | P2                    |
| G-29     | Intention figée à `standard`, marché unique `tunisia` : niches peu discriminantes                                                                                                                                                   | `lead-capture-form.tsx:73` ; `leads-core.ts:41`                                                                 | P3    | P2                    |
| G-30     | Aucune donnée de région, de période ou de budget sur les prospects                                                                                                                                                                  | schéma `leads`                                                                                                  | P3    | P2 (décision produit) |
| G-31     | Textes d'analytique qui ne correspondent pas au code (« exécutables », « historique », « onglets »)                                                                                                                                 | `analytics/page.tsx:85,91` ; `action/page.tsx:4` ; `trends/page.tsx:6`                                          | P8    | P3                    |
| G-32     | Seuils de score différents entre table (75/50) et pipeline (70/40/10)                                                                                                                                                               | `leads-table.tsx:402-406` ; `lead-pipeline.tsx:95`                                                              | P3    | P3                    |
| G-33     | Radar VIP calculé prospect par prospect (performance)                                                                                                                                                                               | `radar-vip-actions.ts:123-128`                                                                                  | P3    | P3                    |
| G-34     | Lancement sans étape d'édition ni de confirmation                                                                                                                                                                                   | `campaign-engine/page.tsx:75-81`                                                                                | P4    | P2                    |
| G-35     | Consentement non vérifié si la référence de contact est vide                                                                                                                                                                        | `campaign-delivery-core.ts:135`                                                                                 | P4    | P3                    |
| G-36     | Cas « succès » de la livraison jamais testé (`test.skip`)                                                                                                                                                                           | `campaign-delivery-core.test.ts:69`                                                                             | P4    | P1                    |
| G-37     | Campagnes WhatsApp toujours ignorées (pas de modèle) ; propositions « téléphone » → appel, jamais livrées                                                                                                                           | `campaign-delivery-core.ts:166-175` ; `campaign-engine-core.ts:83`                                              | P4    | P2                    |
| G-38     | Aucune action d'arrêt, pause ou clôture ; `completed` jamais écrit                                                                                                                                                                  | grep                                                                                                            | P4    | P2                    |
| G-39     | Promotions : aucune interface ni action de création                                                                                                                                                                                 | `promo-core.ts:70,148`                                                                                          | P4    | P2                    |
| G-40     | Actions tâches : pas de garde base, erreurs brutes, appartenance du prospect non vérifiée                                                                                                                                           | `task-actions.ts` ; `task-core.ts:58-60`                                                                        | P4    | P2                    |
| G-41     | Relance quotidienne : sans réglage en base, ne s'exécute pour aucune agence ; erreurs d'envoi non relancées ; fonction non testée                                                                                                   | `notify-stale-leads.ts`                                                                                         | P4    | P2                    |
| G-42     | `autoConvertLead` : aucun test                                                                                                                                                                                                      | §7                                                                                                              | P5    | P1                    |
| G-43     | `booking/confirmed` émis pour l'hôtel seulement : pas d'auto-conversion ni d'attribution automatique pour Omra, transfert, package, activité…                                                                                       | `manual-payment-actions.ts:589` et émetteurs hôtel                                                              | P5    | P2                    |
| G-44     | Attribution : les 500 réservations non attribuées les plus récentes à chaque passage ; les plus anciennes peuvent ne jamais être examinées                                                                                          | `campaign-attribution-core.ts:241-255`                                                                          | P5    | P2                    |
| G-45     | Route du cron d'attribution sans try/catch ni test                                                                                                                                                                                  | `route.ts:45-47`                                                                                                | P5    | P3                    |
| G-46     | Synchronisation CRM externe : fournisseur codé en dur « non configuré » ; une ligne d'audit à chaque évènement                                                                                                                      | `lib/crm/provider.ts:79-90`                                                                                     | P5    | P3 (décision produit) |
| G-47     | Fiche client B2C non reliée au CRM (prospects, 360, fidélité, consentement)                                                                                                                                                         | `b2c/clients/[id]/page.tsx`                                                                                     | P7    | P2                    |
| G-48     | Réactivation et suivi des clients inactifs absents                                                                                                                                                                                  | —                                                                                                               | P7    | P2                    |
| G-49     | 9 fichiers de tests réels jamais exécutés en CI                                                                                                                                                                                     | §7                                                                                                              | P1    | P1                    |
| G-50     | Tests trompeurs (copie locale, `test.skip`, assertions toujours vraies)                                                                                                                                                             | §7                                                                                                              | P1    | P2                    |
| G-51     | Double création des tables CRM (migration générée 0011 sans RLS)                                                                                                                                                                    | `drizzle/0011`                                                                                                  | P1    | P2                    |
| G-52     | Dérive schéma Drizzle / migrations ; contraintes de valeur manquantes                                                                                                                                                               | rapport base                                                                                                    | P1    | P3                    |
| G-53     | Clés étrangères bloquant la suppression ; conflit prospect converti / réservation supprimée                                                                                                                                         | `0116:22-24` ; `0043`                                                                                           | P5    | P3                    |
| G-54     | Recherche de la liste clients B2C sans effet ; statistiques sur 100 lignes                                                                                                                                                          | `b2c/clients/page.tsx:72,118-129,190`                                                                           | P7    | P3                    |

## 10. Conclusion

- **Prouvé en réel aujourd'hui** : la capture de prospects par le formulaire et les landing pages (prospect, contact, consentement, origine, attribution de campagne par URL) et le déclenchement d'Inngest. **Tout le reste du parcours CRM reste à prouver.**
- **Avant tout lancement de campagne en production**, il faut corriger **G-01, G-06 et G-10** (et G-02, G-07). Depuis l'activation d'Inngest et de Resend le 30/10, lancer une campagne enverrait réellement des emails, en double au premier destinataire.
- **Critère final de certification** : le parcours canal → enregistrement → consentement → qualification → action → réservation → revenu → fidélisation. Il est aujourd'hui démontré jusqu'à **l'enregistrement et le consentement** pour le seul canal du site.
