-- Migration 0065: Priority-based Commercial Rules engine
-- Makes agency_id and channel nullable (NULL = wildcard match).
-- Adds priority, product_scope, min_markup, max_markup.

ALTER TABLE flight_commercial_rules
  ALTER COLUMN agency_id DROP NOT NULL,
  ALTER COLUMN channel   DROP NOT NULL;

ALTER TABLE flight_commercial_rules
  ADD COLUMN IF NOT EXISTS priority     integer        NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS product_scope jsonb,
  ADD COLUMN IF NOT EXISTS min_markup   numeric(12, 3),
  ADD COLUMN IF NOT EXISTS max_markup   numeric(12, 3);

-- Primary lookup index: active rules, highest priority first
CREATE INDEX IF NOT EXISTS flight_commercial_rules_priority_idx
  ON flight_commercial_rules (priority DESC)
  WHERE is_active = true;

COMMENT ON COLUMN flight_commercial_rules.agency_id IS
  'NULL = global rule applies to all agencies';
COMMENT ON COLUMN flight_commercial_rules.channel IS
  'NULL = applies to all channels (B2C/B2B/PARTNER/WHITE_LABEL)';
COMMENT ON COLUMN flight_commercial_rules.priority IS
  'Higher number wins when multiple rules match. Default 50.';
COMMENT ON COLUMN flight_commercial_rules.product_scope IS
  'Optional JSON scope: {cabin?, provider?, origin?, destination?, airline?}. NULL = matches all.';
COMMENT ON COLUMN flight_commercial_rules.min_markup IS
  'Floor on computed markup amount (in selling currency).';
COMMENT ON COLUMN flight_commercial_rules.max_markup IS
  'Ceiling on computed markup amount (in selling currency).';
