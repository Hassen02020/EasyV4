/**
 * R9-01 — invariants statiques anti-fabrication.
 *
 * Vérifie que :
 * 1. Le schéma Drizzle déclare bien source_url / published_at / confidence
 *    en NOT NULL pour market_signals et development_projects.
 * 2. La migration SQL 0093 contient bien les contraintes NOT NULL correspondantes.
 * 3. La migration RLS 0094 active bien RLS sur les deux tables et limite
 *    l'écriture à is_super_admin().
 * 4. Les enums confidence sont cohérents entre le schéma et la migration.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const MIGRATION_DDL = readFileSync(
  join(ROOT, "drizzle/manual/0093_market_signals.sql"),
  "utf8",
)
const MIGRATION_RLS = readFileSync(
  join(ROOT, "drizzle/manual/0094_market_signals_rls.sql"),
  "utf8",
)
const SCHEMA = readFileSync(join(ROOT, "lib/db/schema/market.ts"), "utf8")

// -------------------------------------------------------------------------
// Schéma Drizzle — NOT NULL
// -------------------------------------------------------------------------

test("market_signals.sourceUrl est NOT NULL dans le schéma Drizzle", () => {
  assert.ok(
    /sourceUrl.*notNull\(\)/.test(SCHEMA),
    "sourceUrl doit être .notNull() dans market.ts",
  )
})

test("market_signals.publishedAt est NOT NULL dans le schéma Drizzle", () => {
  assert.ok(
    /publishedAt.*notNull\(\)/.test(SCHEMA),
    "publishedAt doit être .notNull() dans market.ts",
  )
})

test("market_signals.confidence est NOT NULL dans le schéma Drizzle", () => {
  // confidence est un pgEnum — notNull() apparaît après l'appel
  const marketSignalsBlock = SCHEMA.slice(
    SCHEMA.indexOf("marketSignals = pgTable"),
    SCHEMA.indexOf("export type MarketSignal"),
  )
  assert.ok(
    /confidence.*notNull\(\)/.test(marketSignalsBlock),
    "confidence doit être .notNull() dans la table marketSignals",
  )
})

test("development_projects.sourceUrl est NOT NULL dans le schéma Drizzle", () => {
  const devBlock = SCHEMA.slice(SCHEMA.indexOf("developmentProjects = pgTable"))
  assert.ok(
    /sourceUrl.*notNull\(\)/.test(devBlock),
    "sourceUrl doit être .notNull() dans developmentProjects",
  )
})

test("development_projects.publishedAt est NOT NULL dans le schéma Drizzle", () => {
  const devBlock = SCHEMA.slice(SCHEMA.indexOf("developmentProjects = pgTable"))
  assert.ok(
    /publishedAt.*notNull\(\)/.test(devBlock),
    "publishedAt doit être .notNull() dans developmentProjects",
  )
})

test("development_projects.confidence est NOT NULL dans le schéma Drizzle", () => {
  const devBlock = SCHEMA.slice(SCHEMA.indexOf("developmentProjects = pgTable"))
  assert.ok(
    /confidence.*notNull\(\)/.test(devBlock),
    "confidence doit être .notNull() dans developmentProjects",
  )
})

// -------------------------------------------------------------------------
// Migration SQL 0093 — NOT NULL
// -------------------------------------------------------------------------

test("0093 : source_url NOT NULL sur market_signals", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS market_signals"),
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /source_url\s+text\s+NOT NULL/.test(block),
    "0093 doit déclarer source_url text NOT NULL sur market_signals",
  )
})

test("0093 : published_at NOT NULL sur market_signals", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS market_signals"),
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /published_at\s+timestamptz\s+NOT NULL/.test(block),
    "0093 doit déclarer published_at timestamptz NOT NULL sur market_signals",
  )
})

test("0093 : confidence NOT NULL sur market_signals", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS market_signals"),
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /confidence\s+market_signal_confidence\s+NOT NULL/.test(block),
    "0093 doit déclarer confidence market_signal_confidence NOT NULL",
  )
})

test("0093 : source_url NOT NULL sur development_projects", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /source_url\s+text\s+NOT NULL/.test(block),
    "0093 doit déclarer source_url text NOT NULL sur development_projects",
  )
})

test("0093 : published_at NOT NULL sur development_projects", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /published_at\s+timestamptz\s+NOT NULL/.test(block),
    "0093 doit déclarer published_at timestamptz NOT NULL sur development_projects",
  )
})

test("0093 : confidence NOT NULL sur development_projects", () => {
  const block = MIGRATION_DDL.slice(
    MIGRATION_DDL.indexOf("CREATE TABLE IF NOT EXISTS development_projects"),
  )
  assert.ok(
    /confidence\s+development_project_confidence\s+NOT NULL/.test(block),
    "0093 doit déclarer confidence development_project_confidence NOT NULL",
  )
})

// -------------------------------------------------------------------------
// Migration RLS 0094 — sécurité
// -------------------------------------------------------------------------

test("0094 : RLS activée sur market_signals", () => {
  assert.ok(
    /ENABLE ROW LEVEL SECURITY/.test(MIGRATION_RLS) &&
      /market_signals.*ENABLE ROW LEVEL SECURITY|ENABLE ROW LEVEL SECURITY.*market_signals/.test(
        MIGRATION_RLS.replace(/\n/g, " "),
      ),
    "0094 doit activer RLS sur market_signals",
  )
})

test("0094 : RLS activée sur development_projects", () => {
  assert.ok(
    /development_projects.*ENABLE ROW LEVEL SECURITY|ENABLE ROW LEVEL SECURITY.*development_projects/.test(
      MIGRATION_RLS.replace(/\n/g, " "),
    ),
    "0094 doit activer RLS sur development_projects",
  )
})

test("0094 : écriture limitée à is_super_admin() pour market_signals", () => {
  assert.ok(
    /market_signals_admin_write/.test(MIGRATION_RLS),
    "0094 doit définir la policy market_signals_admin_write",
  )
  assert.ok(
    /is_super_admin\(\)/.test(MIGRATION_RLS),
    "0094 doit utiliser is_super_admin() dans les policies d'écriture",
  )
})

test("0094 : écriture limitée à is_super_admin() pour development_projects", () => {
  assert.ok(
    /development_projects_admin_write/.test(MIGRATION_RLS),
    "0094 doit définir la policy development_projects_admin_write",
  )
})

// -------------------------------------------------------------------------
// Cohérence enum confidence (LOW | MEDIUM | HIGH)
// -------------------------------------------------------------------------

test("enum market_signal_confidence contient LOW, MEDIUM, HIGH dans le schéma", () => {
  assert.ok(
    /"LOW"/.test(SCHEMA) && /"MEDIUM"/.test(SCHEMA) && /"HIGH"/.test(SCHEMA),
    "enum confidence doit contenir LOW, MEDIUM, HIGH",
  )
})

test("enum market_signal_confidence contient LOW, MEDIUM, HIGH dans la migration", () => {
  assert.ok(
    /'LOW'/.test(MIGRATION_DDL) &&
      /'MEDIUM'/.test(MIGRATION_DDL) &&
      /'HIGH'/.test(MIGRATION_DDL),
    "enum confidence doit contenir LOW, MEDIUM, HIGH dans 0093",
  )
})
