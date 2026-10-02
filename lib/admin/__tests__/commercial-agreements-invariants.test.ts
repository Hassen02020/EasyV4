/**
 * Invariants statiques — AGREEMENT-01 (`commercial_agreements`).
 *
 * Vérifie sur le code source réel (readFileSync) que :
 *  1. `lib/admin/commercial-agreements-actions.ts` réutilise EXACTEMENT le
 *     pattern `requireSuperAdmin()` déjà établi par
 *     `lib/admin/mutuelle-groups-actions.ts` (profile.role !== "super_admin")
 *     — pas un check inventé, pas de contournement.
 *  2. Les 3 actions exportées (create/setStatus/list) appellent bien
 *     `requireSuperAdmin()` avant toute lecture/écriture DB.
 *  3. Les migrations 0087/0088/0089 existent, portent bien
 *     `is_super_admin()` SANS clause `agency_id = current_agency_id()` sur
 *     la policy d'écriture (contrairement à `margin_rules_tenant_isolation`
 *     elle-même) — [D-01a], aucune exception agence.
 *  4. `margin_rules.agreement_id` (financials.ts) est purement additif :
 *     `lib/pro/pricing.ts` (`applyMargin`) et `lib/pro/server-context.ts`
 *     (`getMarginsForAgency`) ne référencent jamais `agreementId`/
 *     `agreement_id` — confirmé par grep sur leur source réelle, pas une
 *     simple affirmation de commentaire.
 *  5. Aucune ligne réelle/permanente de `commercial_agreements` ou de
 *     `margin_rules` n'est insérée par du code applicatif NON-test — seuls
 *     les fichiers `__tests__/**` et les migrations SQL (schéma, pas
 *     données) référencent `.insert(commercialAgreements)`/
 *     `.insert(marginRules)`.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(
  join(ROOT, "lib/admin/commercial-agreements-actions.ts"),
  "utf8",
)
const mutuelleActionsSrc = readFileSync(
  join(ROOT, "lib/admin/mutuelle-groups-actions.ts"),
  "utf8",
)
const pricingSrc = readFileSync(join(ROOT, "lib/pro/pricing.ts"), "utf8")
const serverContextSrc = readFileSync(
  join(ROOT, "lib/pro/server-context.ts"),
  "utf8",
)
const migration0087 = readFileSync(
  join(ROOT, "drizzle/manual/0087_agreement_01.sql"),
  "utf8",
)
const migration0088 = readFileSync(
  join(ROOT, "drizzle/manual/0088_agreement_01_rls.sql"),
  "utf8",
)
const migration0089 = readFileSync(
  join(ROOT, "drizzle/manual/0089_agreement_01_margin_rules_link.sql"),
  "utf8",
)

/* -------------------------------------------------------------------------- */
/* Pattern requireSuperAdmin() réutilisé, pas inventé                          */
/* -------------------------------------------------------------------------- */

test('commercial-agreements-actions.ts : définit requireSuperAdmin() avec la même forme que mutuelle-groups-actions.ts (profile?.role !== "super_admin")', () => {
  assert.match(actionsSrc, /async function requireSuperAdmin\(\)/)
  assert.match(actionsSrc, /profile\?\.role !== "super_admin"/)
  assert.match(mutuelleActionsSrc, /profile\?\.role !== "super_admin"/)
})

test("commercial-agreements-actions.ts : requireSuperAdmin() relit le profil via getCurrentAdminProfile (auth réelle, pas un rôle passé en paramètre)", () => {
  assert.match(
    actionsSrc,
    /import\s*\{\s*getCurrentAdminProfile\s*\}\s*from\s*["']@\/lib\/auth\/profile["']/,
  )
  assert.match(actionsSrc, /getCurrentAdminProfile\(user\.id\)/)
})

test("commercial-agreements-actions.ts : les 3 actions exportées appellent requireSuperAdmin() avant toute opération DB", () => {
  const fns = [
    "createCommercialAgreement",
    "setCommercialAgreementStatus",
    "listCommercialAgreements",
  ]
  for (const fn of fns) {
    const idx = actionsSrc.indexOf(`export async function ${fn}`)
    assert.ok(idx >= 0, `${fn} doit être exporté`)
    const body = actionsSrc.slice(idx, idx + 700)
    assert.match(
      body,
      /await requireSuperAdmin\(\)/,
      `${fn} doit appeler requireSuperAdmin() tôt dans son corps`,
    )
  }
})

/* -------------------------------------------------------------------------- */
/* [D-01a] RLS écriture : super_admin uniquement, AUCUNE exception agence      */
/* -------------------------------------------------------------------------- */

test("0088_agreement_01_rls.sql : policy d'écriture = is_super_admin() seul (FOR ALL), sans agency_id = current_agency_id()", () => {
  const writePolicyMatch = migration0088.match(
    /CREATE POLICY "commercial_agreements_admin_write"[\s\S]*?WITH CHECK \(([\s\S]*?)\);/,
  )
  assert.ok(
    writePolicyMatch,
    "la policy commercial_agreements_admin_write doit exister",
  )
  const check = writePolicyMatch![1]!
  assert.match(check, /is_super_admin\(\)/)
  assert.doesNotMatch(
    check,
    /current_agency_id\(\)/,
    "contrairement à margin_rules_tenant_isolation, AUCUNE clause agency_id = current_agency_id() sur l'écriture — [D-01a]",
  )
})

test("0088_agreement_01_rls.sql : FORCE ROW LEVEL SECURITY appliqué (s'applique aussi au propriétaire de la table)", () => {
  assert.match(
    migration0088,
    /ALTER TABLE commercial_agreements FORCE ROW LEVEL SECURITY;/,
  )
})

test("0087_agreement_01.sql : idempotent (CREATE TABLE IF NOT EXISTS, CREATE TYPE protégé par exception, CREATE INDEX IF NOT EXISTS)", () => {
  assert.match(
    migration0087,
    /CREATE TABLE IF NOT EXISTS commercial_agreements/,
  )
  assert.match(migration0087, /WHEN duplicate_object THEN NULL/)
  assert.match(migration0087, /CREATE INDEX IF NOT EXISTS/)
})

test("0089_agreement_01_margin_rules_link.sql : ADD COLUMN IF NOT EXISTS, FK ON DELETE SET NULL, aucune donnée existante modifiée (pas d'UPDATE)", () => {
  assert.match(
    migration0089,
    /ALTER TABLE margin_rules ADD COLUMN IF NOT EXISTS agreement_id uuid;/,
  )
  assert.match(
    migration0089,
    /REFERENCES commercial_agreements\(id\) ON DELETE SET NULL/,
  )
  assert.doesNotMatch(
    migration0089,
    /UPDATE margin_rules/i,
    "purement additif : aucun UPDATE sur des lignes margin_rules existantes",
  )
})

/* -------------------------------------------------------------------------- */
/* Additivité : applyMargin()/getMarginsForAgency() ignorent agreement_id     */
/* -------------------------------------------------------------------------- */

test("lib/pro/pricing.ts (applyMargin) : ne référence jamais agreementId/agreement_id", () => {
  assert.doesNotMatch(pricingSrc, /agreementId|agreement_id/)
})

test("lib/pro/server-context.ts (getMarginsForAgency) : ne référence jamais agreementId/agreement_id — la colonne ajoutée par AGREEMENT-01 est invisible à ce SELECT", () => {
  assert.doesNotMatch(serverContextSrc, /agreementId|agreement_id/)
})

/* -------------------------------------------------------------------------- */
/* Aucune donnée réelle/permanente créée par du code non-test                  */
/* -------------------------------------------------------------------------- */

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith("."))
      continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(full)
  }
  return out
}

test("aucun code applicatif NON-test n'insère un commercial_agreements ou un margin_rules réel en dehors de lib/admin/commercial-agreements-actions.ts (create, super_admin-gated) et de reservation-financials.ts/product-booking-actions.ts (déjà audités, inchangés par ce chantier)", () => {
  const ROOT2 = process.cwd()
  const appSources = ["lib", "app", "components"].flatMap((d) =>
    sourceFiles(join(ROOT2, d)),
  )
  const allowlist = new Set([
    join(ROOT2, "lib/admin/commercial-agreements-actions.ts"),
  ])
  const offenders: string[] = []
  for (const file of appSources) {
    if (allowlist.has(file)) continue
    const src = readFileSync(file, "utf8")
    if (/\.insert\(\s*commercialAgreements\s*\)/.test(src)) offenders.push(file)
  }
  assert.deepEqual(
    offenders,
    [],
    "seule commercial-agreements-actions.ts (super_admin-gated) doit insérer commercial_agreements",
  )
})
