-- R9-01 (2026-10-02) : tables market_signals + development_projects
-- Garde-fous anti-fabrication : source_url NOT NULL, published_at NOT NULL,
-- confidence NOT NULL — interdit l'insertion de données marché sans traçabilité.

-- -------------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE market_signal_confidence AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE development_project_confidence AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -------------------------------------------------------------------------
-- market_signals
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_signals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Garde-fous anti-fabrication
  source_url    text        NOT NULL,
  published_at  timestamptz NOT NULL,
  confidence    market_signal_confidence NOT NULL,

  -- Contenu
  title         text        NOT NULL,
  summary       text,
  category      text,
  region        text,

  -- Métadonnées
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_signals_published_at_idx ON market_signals (published_at);
CREATE INDEX IF NOT EXISTS market_signals_confidence_idx   ON market_signals (confidence);
CREATE INDEX IF NOT EXISTS market_signals_region_idx       ON market_signals (region);

-- -------------------------------------------------------------------------
-- development_projects
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS development_projects (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Garde-fous anti-fabrication
  source_url    text        NOT NULL,
  published_at  timestamptz NOT NULL,
  confidence    development_project_confidence NOT NULL,

  -- Contenu
  name          text        NOT NULL,
  description   text,
  location      text,
  project_type  text,
  status        text,

  -- Métadonnées
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS development_projects_published_at_idx ON development_projects (published_at);
CREATE INDEX IF NOT EXISTS development_projects_confidence_idx   ON development_projects (confidence);
CREATE INDEX IF NOT EXISTS development_projects_location_idx     ON development_projects (location);
