-- CRM / Inbox omnicanal — fondations du "Customer 360" demandé (diagramme
-- cible EASY2BOOK CRM Omnicanal joint à l'audit senior OTA).
--
-- Portée de cette migration : le MODÈLE DE DONNÉES, agnostique du canal
-- (whatsapp/instagram/messenger/call/email/web), pas une intégration
-- réelle de chaque canal. Seul WhatsApp a un webhook entrant réellement
-- branché dans cette passe (Meta Cloud API, déjà utilisée en sortant par
-- lib/whatsapp/provider.ts — voir app/api/webhooks/whatsapp/route.ts) :
-- Instagram/Messenger nécessitent une App Review Meta (Page token, scope
-- pages_messaging) et Call un fournisseur de téléphonie — aucun des deux
-- n'a de credentials configurés, donc aucun code prétendant les intégrer
-- n'est écrit ici. Le schéma reste volontairement prêt à les recevoir
-- (colonne `channel` extensible) sans fabriquer une fausse intégration.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0046_crm_inbox.sql

begin;

create table crm_conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  channel varchar(16) not null,
  -- Numéro E.164 normalisé (whatsapp/call) — clé de contact principale
  -- pour les canaux actuellement réels.
  contact_phone varchar(32),
  -- Identifiant externe du contact pour un canal futur sans téléphone
  -- (ex. PSID Instagram/Messenger) — nullable, jamais utilisé aujourd'hui.
  contact_external_id varchar(128),
  -- Nom de profil transmis par le fournisseur (ex. WhatsApp profile name)
  -- — un instantané d'affichage, jamais une source d'identité fiable.
  contact_name varchar(200),
  lead_id uuid references leads(id) on delete set null,
  status varchar(16) not null default 'open',
  last_message_at timestamptz,
  -- Horodatage du DERNIER message entrant — sert à calculer la fenêtre de
  -- service WhatsApp de 24h (voir lib/whatsapp/provider.ts) avant d'
  -- autoriser une réponse libre plutôt qu'un template pré-approuvé.
  last_inbound_at timestamptz,
  last_message_preview varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_conversations_channel_check
    check (channel in ('whatsapp', 'instagram', 'messenger', 'call', 'email', 'web')),
  constraint crm_conversations_status_check
    check (status in ('open', 'closed'))
);

-- Une seule conversation par (agence, canal, contact) — les messages
-- suivants du même contact s'accumulent dans la même conversation au lieu
-- d'en recréer une (voir upsertConversationForInboundCore).
create unique index crm_conversations_agency_channel_phone_uniq
  on crm_conversations (agency_id, channel, contact_phone)
  where contact_phone is not null;
create unique index crm_conversations_agency_channel_external_uniq
  on crm_conversations (agency_id, channel, contact_external_id)
  where contact_external_id is not null;
create index crm_conversations_agency_idx
  on crm_conversations (agency_id, last_message_at desc);
create index crm_conversations_lead_idx
  on crm_conversations (lead_id) where lead_id is not null;

alter table crm_conversations enable row level security;
alter table crm_conversations force row level security;

create policy "crm_conversations_tenant_isolation" on crm_conversations
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

create table crm_messages (
  id uuid primary key default gen_random_uuid(),
  -- Dénormalisé depuis crm_conversations, même convention que
  -- payments.agency_id (dénormalisé depuis reservations) — évite une
  -- policy RLS par sous-requête sur la table la plus interrogée (thread).
  agency_id uuid not null references agencies(id) on delete cascade,
  conversation_id uuid not null references crm_conversations(id) on delete cascade,
  direction varchar(8) not null,
  body text,
  -- Qui a envoyé un message sortant — jamais renseigné pour un entrant.
  handled_by_user_id uuid,
  -- wamid Meta (ou équivalent futur) — sert à l'idempotence : un webhook
  -- WhatsApp peut être redélivré, jamais retraité en double.
  external_message_id varchar(128),
  created_at timestamptz not null default now(),
  constraint crm_messages_direction_check
    check (direction in ('inbound', 'outbound'))
);

create unique index crm_messages_external_message_id_uniq
  on crm_messages (external_message_id)
  where external_message_id is not null;
create index crm_messages_conversation_idx
  on crm_messages (conversation_id, created_at);

alter table crm_messages enable row level security;
alter table crm_messages force row level security;

create policy "crm_messages_tenant_isolation" on crm_messages
  for all
  using (agency_id = current_agency_id() or is_super_admin())
  with check (agency_id = current_agency_id() or is_super_admin());

commit;
