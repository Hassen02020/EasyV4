-- Phase 35 — Supplier Portal Foundation (L0/L1 self-service)
-- supplier_nodes   : identité réseau du fournisseur (séparé de la config technique `suppliers`)
-- supplier_portal_users : utilisateurs humains du portail d'un nœud

-- ============================================================
-- 1. Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE supplier_onboarding_status AS ENUM (
    'invited',
    'onboarding',
    'pending_review',
    'active',
    'suspended',
    'offboarded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE supplier_portal_user_role AS ENUM (
    'owner',
    'manager',
    'staff'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. supplier_nodes
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_nodes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  slug                varchar(100) NOT NULL,
  display_name        varchar(200) NOT NULL,
  short_description   text,
  contact_name        varchar(200),
  contact_email       varchar(320),
  contact_phone       varchar(32),
  contact_country     varchar(3),
  modules             jsonb NOT NULL DEFAULT '[]',
  onboarding_status   supplier_onboarding_status NOT NULL DEFAULT 'invited',
  portal_enabled      boolean NOT NULL DEFAULT false,
  logo_url            text,
  internal_notes      text,
  invited_by_user_id  uuid,
  activated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_nodes_slug_uniq      ON supplier_nodes (slug);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_nodes_supplier_uniq  ON supplier_nodes (supplier_id);
CREATE        INDEX IF NOT EXISTS supplier_nodes_onboarding_idx ON supplier_nodes (onboarding_status);
CREATE        INDEX IF NOT EXISTS supplier_nodes_portal_idx     ON supplier_nodes (portal_enabled);

-- ============================================================
-- 3. supplier_portal_users
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_portal_users (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_node_id              uuid NOT NULL REFERENCES supplier_nodes(id) ON DELETE CASCADE,
  user_id                       uuid NOT NULL,
  role                          supplier_portal_user_role NOT NULL DEFAULT 'staff',
  invited_email                 varchar(320),
  invitation_token              varchar(128),
  invitation_token_expires_at   timestamptz,
  invited_at                    timestamptz NOT NULL DEFAULT now(),
  accepted_at                   timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_portal_users_node_user_uniq ON supplier_portal_users (supplier_node_id, user_id);
CREATE        INDEX IF NOT EXISTS supplier_portal_users_user_idx       ON supplier_portal_users (user_id);
CREATE        INDEX IF NOT EXISTS supplier_portal_users_node_idx       ON supplier_portal_users (supplier_node_id);
CREATE        INDEX IF NOT EXISTS supplier_portal_users_role_idx       ON supplier_portal_users (role);
