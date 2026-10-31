# CRM-SOCIAL-CONNECT-01 — Audit des connexions des canaux au CRM

Date : 2026-10-31 · Mode : lecture seule (aucun code, aucune migration,
aucune écriture en production, aucun compte plateforme modifié).
Base observée : `main` @ `3196e294` (PR #320 incluse ; PR #321 — G-05 — verte
mais non fusionnée, mentionnée là où elle change le constat).

## 0. Méthode et preuves

| Source                           | Ce qui a été lu                                                                                                                 | Limite                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Code (`main`)                    | routes `app/api/webhooks/*`, `lib/crm/*`, `lib/meta-leadads/*`, `lib/whatsapp/*`, `submit-lead.ts`                              | —                                                                  |
| Vercel `easy2book-new`           | **noms** des variables d'environnement (jamais les valeurs)                                                                     | —                                                                  |
| Production (Supabase, SELECT)    | comptages `leads`, `lead_origin_events`, `contacts`, `lead_consent_events`, `crm_conversations`, `crm_messages`, `audit_events` | lecture seule, agrégats sans donnée personnelle                    |
| Production (HTTP GET)            | `GET /api/webhooks/{whatsapp,instagram,messenger,meta-leadads}` sans paramètre (aucun effet)                                    | `resend-inbound` est POST seulement : non sondé (un POST écrirait) |
| Journaux Vercel                  | refusé : l'offre Hobby ne conserve qu'1 h de journaux                                                                           | **aucun historique de trafic webhook disponible**                  |
| Tests locaux (Postgres réel)     | 93 tests des canaux (détail §7)                                                                                                 | prouvent le code, **pas** une connexion externe                    |
| Comptes Meta / WhatsApp / TikTok | **non consultés** (aucun accès, et interdit par la mission)                                                                     | abonnements, permissions, app review : **NOT VERIFIED**            |

## 1. Constat global

- **Aucune variable** Meta, WhatsApp, Instagram, Messenger, TikTok ni
  `RESEND_INBOUND_SECRET` n'existe sur Vercel, dans **aucun** environnement
  (Production, Preview, Development). Variables présentes côté CRM :
  `RESEND_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` seulement.
- Conséquence vérifiée en production : les 4 webhooks sociaux répondent
  **`503 {"error":"Misconfigured"}`** (2026-10-31 08:20 UTC). Meta ne peut donc
  ni valider l'abonnement (handshake GET), ni livrer un événement.
- Données réelles en production : **4 leads, tous issus du site** ;
  **0 conversation, 0 message** ; aucun lead Lead Ads / WhatsApp / Instagram /
  Messenger / email entrant n'a jamais été enregistré.

## 2. Canal par canal

### 2.1 Site et landing page — **FONCTIONNE (prouvé)**

- Chaîne : formulaire → `app/actions/submit-lead.ts` (Zod, limitation de débit,
  agence par défaut) → `captureWebsiteLeadCore`
  (`lib/crm/website-lead-capture-core.ts`) → `createLeadCore` →
  `recordLeadOriginEventCore` (rôle `channel`, `website` / `website_form`) →
  `resolveOrCreateContactCore` (email sinon téléphone) →
  `recordConsentEventCore` **uniquement si la case est cochée** (jamais
  implicite) → `crm/lead.created` (notification, avec `channel:
"website_form"` depuis #320).
- Preuves production : 2 leads du 2026-10-30 (`/hotels/519`, `/landing/omra`)
  ont chacun 1 événement de provenance ; 6 consentements `granted`
  `website_form` (email, whatsapp, call × 2 leads) ; 3 contacts.
- 2 leads du 2026-09-19 sans provenance : **antérieurs** au câblage
  (CRM-LEAD-WIRING-01) — historique, pas une régression.
- Dédoublonnage : contact unique par (agence, canal, référence normalisée) ;
  **le lead lui-même n'est pas dédoublonné** (deux envois = deux leads) —
  conforme à la conception actuelle (G-15).
- Limite : la notification email reste bloquée par la clé Resend
  (1 `inngest.dispatch_failed` tracé le 30/10) — hors périmètre canal.

### 2.2 WhatsApp Business (+216 98 140 514) — **EXISTE, NON RACCORDÉ**

- Entrant : `app/api/webhooks/whatsapp/route.ts` → HMAC
  `x-hub-signature-256` (`lib/whatsapp/signing.ts`, `WHATSAPP_APP_SECRET`) →
  `upsertConversationForInboundCore` (`lib/crm/inbox-core.ts`) : contact
  `whatsapp` normalisé, conversation, message idempotent (`external_message_id`
  = `wamid`, index unique partiel), lead créé si aucun lead n'a ce téléphone,
  provenance `whatsapp_webhook`, notification si nouveau lead (#320).
  Accusés de livraison (`statuses`) ignorés. Messages non texte ignorés (G-27).
- Sortant : `lib/whatsapp/provider.ts` (Cloud API, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`), confirmation de
  réservation par modèle (`WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`),
  réponse depuis l'inbox limitée à la fenêtre 24 h.
- Configuration : `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` **absentes** → 503.
- Consentement : **aucun** événement écrit à la réception d'un message
  (correct : écrire n'est pas consentir au marketing). Pas de traçage
  d'opt-in WhatsApp marketing.
- Inconnues plateforme (NOT VERIFIED) : le numéro est-il inscrit sur
  **WhatsApp Business Platform (Cloud API)** ou seulement sur l'application
  WhatsApp Business ? Un numéro de l'application ne reçoit pas de webhook
  Cloud API sans migration / coexistence. Compte Business vérifié, modèle de
  message approuvé : inconnus.

### 2.3 Facebook « Easy2Book » — Lead Ads et Messenger — **EXISTE, NON RACCORDÉ**

- Lead Ads : `app/api/webhooks/meta-leadads/route.ts` (HMAC `META_APP_SECRET`,
  handshake `META_LEADADS_VERIFY_TOKEN`) → `fetchMetaLeadFieldDataCore`
  (Graph API, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`) →
  `captureMetaLeadCore` : idempotence par `leadgen_id` (sélection puis
  insertion, **sans index unique** — G-17), provenance `meta_leadads_webhook`,
  contact, **aucun consentement** écrit (choix documenté : le disclaimer Meta
  n'est pas un consentement marketing). Notification si nouveau (#320).
  Sur `main`, un échec Graph est perdu en silence (200) — **corrigé par
  #321 (G-05), non fusionnée**.
- Messenger : `app/api/webhooks/messenger/route.ts` (HMAC `META_APP_SECRET`,
  `META_MESSENGER_VERIFY_TOKEN`, `object === "page"`) →
  `upsertConversationForInboundCore` (canal `messenger`).
- Configuration : `META_APP_SECRET`, `META_LEADADS_VERIFY_TOKEN`,
  `META_MESSENGER_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN` **absentes** → 503.
- Inconnues plateforme : application Meta, abonnement de la Page aux champs
  `leadgen` et `messages`, permissions `leads_retrieval`,
  `pages_manage_metadata`, `pages_messaging` (App Review), rôle de l'app sur
  la Page — **NOT VERIFIED**.

### 2.4 Instagram @easy2book.2025 — **EXISTE, NON RACCORDÉ**

- `app/api/webhooks/instagram/route.ts` (HMAC `META_APP_SECRET`,
  `META_INSTAGRAM_VERIFY_TOKEN`, `object === "instagram"`) →
  `upsertConversationForInboundCore` (canal `instagram`).
- Configuration : `META_INSTAGRAM_VERIFY_TOKEN`, `META_APP_SECRET`
  **absentes** → 503.
- Défauts de code constatés (non corrigés, mission en lecture seule) :
  1. l'identifiant Instagram (IGSID) est passé comme `contactPhone` et le
     lead est créé avec **`phone` = IGSID** (même chose pour Messenger/PSID) —
     G-27 ;
  2. le prénom par défaut d'un nouveau lead Instagram/Messenger est
     **« Contact WhatsApp »** (`inbox-core.ts:221`) ;
  3. pas de filtre des échos (`is_echo`) : un message envoyé par la Page
     pourrait être traité comme entrant — G-27 ;
  4. pas de réponse sortante Instagram/Messenger (seul WhatsApp a un
     fournisseur d'envoi).
- Inconnues plateforme : compte Instagram **professionnel** relié à la Page
  Facebook, permission `instagram_manage_messages`, accès aux messages
  activé — **NOT VERIFIED**.

### 2.5 TikTok @easy2book — **N'EXISTE PAS (lien uniquement)**

- Seule présence dans le code : le champ `tiktokUrl` (configuration du site,
  pied de page, signature des emails de campagne, landing). **Aucun webhook,
  aucune API, aucune variable, aucune table.**
- Capacités côté TikTok (à confirmer auprès de TikTok, NOT VERIFIED ici) :
  - **Formulaires instantanés des publicités TikTok (Lead Generation)** :
    récupération des prospects possible via l'API Marketing / intégrations
    CRM de TikTok, avec un compte TikTok for Business et une application
    développeur approuvée — c'est la seule source de prospects réaliste.
  - **Messages privés** : **ne pas supposer qu'ils sont accessibles.** L'API de
    messagerie TikTok Business est à accès restreint (programme sur
    approbation, disponibilité selon pays). Sans accès accordé, aucune
    intégration DM n'est possible.
  - Liens trackés : déjà utilisables sans API (paramètres UTM vers la landing
    → provenance `website_form` + `campaign_ref`).

### 2.6 Email entrant (Resend Inbound) — **EXISTE, NON RACCORDÉ**

- `app/api/webhooks/resend-inbound/route.ts` : jeton Bearer
  `RESEND_INBOUND_SECRET` comparé en temps constant → `captureWebsiteLeadCore`.
- Configuration : `RESEND_INBOUND_SECRET` **absente** → 503 (POST, non sondé).
- Défauts : **provenance faussée** — le lead est enregistré comme
  `website` / `website_form` (la fonction du site est réutilisée telle
  quelle) ; pas de signature Resend (Svix) ; pas de déduplication par
  `email_id` (G-16) ; un renvoi crée un second lead.

## 3. Tables CRM alimentées (par canal, d'après le code)

| Canal          | leads      | lead_origin_events         | contacts          | lead_consent_events | crm_conversations / messages |
| -------------- | ---------- | -------------------------- | ----------------- | ------------------- | ---------------------------- |
| Site / landing | oui        | `website` / `website_form` | email ou call     | si case cochée      | non                          |
| Lead Ads       | oui        | `meta_leadads_webhook`     | email ou call     | **jamais**          | non                          |
| WhatsApp       | si nouveau | `whatsapp_webhook`         | whatsapp          | non                 | oui                          |
| Messenger      | si nouveau | `messenger_webhook`        | messenger (PSID)  | non                 | oui                          |
| Instagram      | si nouveau | `instagram_webhook`        | instagram (IGSID) | non                 | oui                          |
| Email entrant  | oui        | **`website_form` (faux)**  | email             | non                 | non                          |
| TikTok         | —          | —                          | —                 | —                   | —                            |

## 4. Synthèse demandée

**A. Ce qui fonctionne déjà (prouvé en production)**

- Site et landing : lead, provenance, contact, consentement explicite.
- Déclenchement Inngest (événement émis ; l'email reste bloqué par la clé
  Resend).

**B. Ce qui existe mais n'est pas raccordé**

- Webhooks WhatsApp, Messenger, Instagram, Lead Ads, email entrant : code
  complet (signature, idempotence, lead/contact/provenance, notification),
  testé localement, **inopérant en production faute de variables** (503).
- Envoi WhatsApp sortant (confirmation de réservation, réponse inbox).

**C. Ce qui est configuré mais non prouvé**

- Rien côté canaux sociaux : **aucune** configuration n'existe.
- Notification « nouveau lead » : configurée (Inngest + Resend) mais non
  prouvée (échec d'envoi tracé le 30/10).

**D. Ce qui doit être développé**

1. Email entrant : provenance propre (`email` / `email_inbound`),
   déduplication par `email_id`, vérification de signature Resend (G-16).
2. Instagram / Messenger : identifiant externe dans `contact_external_id`
   au lieu de `phone`, prénom par défaut par canal, filtre `is_echo`,
   messages non texte (G-27).
3. Lead Ads : index unique `leadgen_id` (G-17 — **migration, fiche et GO
   propres**) ; fusion de #321 (G-05).
4. Consentement : aucune voie pour enregistrer un opt-in reçu par
   WhatsApp/Messenger/Instagram/Lead Ads (question de conformité à trancher :
   que vaut une case de consentement dans un formulaire Lead Ads ?).
5. TikTok : connecteur Lead Generation **seulement après** confirmation de
   l'accès API par TikTok ; aucun développement DM sans accès accordé.

**E. Ce qui nécessite une intervention sur les plateformes (propriétaire)**

- Meta : application Meta (Business), mode Live, App Review des permissions,
  abonnement Page (`leadgen`, `messages`), Instagram professionnel relié,
  jeton de Page longue durée ; URL de callback =
  `https://easy2book-new.vercel.app/api/webhooks/{meta-leadads,messenger,instagram}`.
- WhatsApp : numéro +216 98 140 514 sur WhatsApp Business Platform (Cloud API)
  ou coexistence, ID du numéro, jeton système, modèle approuvé, callback
  `/api/webhooks/whatsapp`.
- Resend : domaine de réception (MX) et route entrante vers
  `/api/webhooks/resend-inbound`.
- TikTok : compte TikTok for Business, application développeur, accès à
  l'API Lead Generation (et, si accordé, messagerie).
- Vercel : création des variables listées en §2 — **GO séparé**, valeurs
  fournies par le propriétaire, jamais affichées.

## 5. Plan de correction proposé (par priorité, chaque ligne = fiche + GO)

| Priorité | ID proposé                   | Contenu                                                                                                           | DB                      | Dépend de                     |
| -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------- |
| P0       | (en cours) G-05 / PR #321    | Lead Ads : plus de perte silencieuse                                                                              | non                     | GO de fusion                  |
| P1       | CRM-SOCIAL-CODE-FIX-01       | IG/Messenger : `contact_external_id`, prénom par canal, `is_echo` ; email entrant : provenance + dédup `email_id` | non (colonne existante) | —                             |
| P1       | CRM-LEADADS-UNIQUE-01 (G-17) | Index unique `leadgen_id`                                                                                         | **oui**                 | fiche + GO + GO prod          |
| P1       | CRM-META-CONNECT-01          | Variables Meta + abonnements → certification Lead Ads / Messenger / Instagram                                     | non                     | intervention Meta (E)         |
| P1       | CRM-WHATSAPP-CONNECT-01      | Variables WhatsApp + webhook → certification WhatsApp                                                             | non                     | intervention WhatsApp (E)     |
| P2       | CRM-EMAIL-INBOUND-CONNECT-01 | Domaine entrant Resend + secret → certification                                                                   | non                     | intervention Resend (E)       |
| P2       | CRM-CHANNEL-CONSENT-01       | Règle et voie d'enregistrement d'un opt-in hors site                                                              | à voir                  | décision produit / conformité |
| P3       | CRM-TIKTOK-LEADGEN-01        | Connecteur TikTok Lead Generation                                                                                 | à voir                  | accès API TikTok confirmé     |

## 6. Tests de certification prévus (par canal, après configuration)

Pour chaque canal, critère « fonctionnel » uniquement si tout est prouvé :

1. Handshake GET : `200` + `hub.challenge` renvoyé (Meta/WhatsApp).
2. Événement de test **autorisé** depuis la plateforme (outil de test Lead Ads,
   message réel vers la Page / le compte Instagram / le numéro WhatsApp,
   email de test vers l'adresse entrante) → `200`.
3. Authenticité : même requête avec signature altérée → `400`/`401`, rien écrit.
4. Base (SELECT) : 1 lead, 1 provenance au bon canal, 1 contact, conversation
   et message (messageries), **aucun consentement fabriqué**.
5. Idempotence : renvoi du même événement (relivraison plateforme ou rejeu
   signé) → aucune nouvelle ligne, aucun second email.
6. Notification : événement `crm/lead.created` émis une fois (Inngest).
7. Journal : aucune erreur critique dans la fenêtre du test.
8. Procédure écrite, datée, reproductible, données de test identifiées puis
   nettoyées selon une procédure approuvée.

## 7. Tests existants et résultats (2026-10-31, local, Postgres réel)

| Fichier                                                                                  | Résultat |
| ---------------------------------------------------------------------------------------- | -------- |
| `lib/whatsapp/__tests__/provider.test.ts`                                                | 7/7      |
| `lib/whatsapp/__tests__/send-booking-confirmation.test.ts`                               | 6/6      |
| `lib/whatsapp/__tests__/signing.test.ts`                                                 | 6/6      |
| `lib/meta-leadads/__tests__/lead-capture-core.test.ts`                                   | 4/4      |
| `lib/crm/__tests__/crm-channel-wiring.test.ts` (statique : Messenger, Instagram, Resend) | 33/33    |
| `lib/crm/__tests__/inbox-core.test.ts`                                                   | 12/12    |
| `lib/crm/__tests__/website-lead-capture-core-live.test.ts`                               | 8/8      |
| `lib/crm/__tests__/lead-notify-channels.test.ts`                                         | 5/5      |
| `lib/crm/__tests__/contact-core-live.test.ts`                                            | 5/5      |
| `lib/crm/__tests__/consent-core-live.test.ts`                                            | 7/7      |

Ces tests prouvent le **code** ; **aucun ne prouve une connexion externe**
(règle : un mock ne prouve jamais une connexion). Aucun test ne couvre la route
WhatsApp de bout en bout ni le cas « échec Graph » sur `main` (couvert par #321).

## 8. Limites de cet audit

- Comptes Meta, WhatsApp, TikTok et Resend non consultés : tout le §4.E est
  déduit du code et de la documentation publique, **NOT VERIFIED**.
- Pas d'historique de trafic webhook (journaux Vercel limités à 1 h).
- Disponibilité des API TikTok (Lead Generation, messagerie) : à confirmer
  auprès de TikTok pour le compte @easy2book.
