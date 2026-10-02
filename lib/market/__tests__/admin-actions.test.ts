/**
 * R11-01 — invariants statiques lib/market/admin-actions.ts
 *
 * Vérifie :
 * 1. requireSuperAdmin() est présent et appelé avant chaque action DB.
 * 2. Les guards de validation Zod couvrent sourceUrl (URL), publishedAt
 *    (datetime), confidence (enum), et les champs obligatoires.
 * 3. revalidatePath est appelé après les opérations d'écriture.
 * 4. Les actions exportées correspondent exactement à la fiche R11-01.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const SRC = readFileSync(join(ROOT, "lib/market/admin-actions.ts"), "utf8")

// -------------------------------------------------------------------------
// requireSuperAdmin guard
// -------------------------------------------------------------------------

test("R11-01 — requireSuperAdmin() est défini dans admin-actions.ts", () => {
  assert.ok(
    /async function requireSuperAdmin/.test(SRC),
    "requireSuperAdmin doit être défini localement",
  )
})

test("R11-01 — requireSuperAdmin vérifie role === super_admin", () => {
  assert.ok(
    /role.*!==.*super_admin/.test(SRC),
    'La guard doit rejeter tout rôle différent de "super_admin"',
  )
})

test("R11-01 — createMarketSignal appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function createMarketSignal"),
    SRC.indexOf("async function deleteMarketSignal"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(authIdx !== -1, "createMarketSignal doit appeler requireSuperAdmin")
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

test("R11-01 — deleteMarketSignal appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function deleteMarketSignal"),
    SRC.indexOf("async function createDevelopmentProject"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(authIdx !== -1, "deleteMarketSignal doit appeler requireSuperAdmin")
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

test("R11-01 — createDevelopmentProject appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function createDevelopmentProject"),
    SRC.indexOf("async function updateDevelopmentProject"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(
    authIdx !== -1,
    "createDevelopmentProject doit appeler requireSuperAdmin",
  )
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

test("R11-01 — updateDevelopmentProject appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function updateDevelopmentProject"),
    SRC.indexOf("async function deleteDevelopmentProject"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(
    authIdx !== -1,
    "updateDevelopmentProject doit appeler requireSuperAdmin",
  )
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

test("R11-01 — deleteDevelopmentProject appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function deleteDevelopmentProject"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(
    authIdx !== -1,
    "deleteDevelopmentProject doit appeler requireSuperAdmin",
  )
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

// -------------------------------------------------------------------------
// Validation Zod — garde-fous sourceUrl et publishedAt
// -------------------------------------------------------------------------

test("R11-01 — createSignalSchema valide sourceUrl comme URL", () => {
  assert.ok(
    /sourceUrl.*z\.string\(\)\.url\(\)/.test(SRC),
    "sourceUrl doit être validé par z.string().url()",
  )
})

test("R11-01 — createSignalSchema valide publishedAt comme datetime", () => {
  assert.ok(
    /publishedAt.*z\.string\(\)\.datetime\(\)/.test(SRC),
    "publishedAt doit être validé par z.string().datetime()",
  )
})

test("R11-01 — confidence validé comme enum LOW/MEDIUM/HIGH", () => {
  assert.ok(
    /z\.enum\(\["LOW",\s*"MEDIUM",\s*"HIGH"\]\)/.test(SRC),
    "confidence doit être z.enum(['LOW','MEDIUM','HIGH'])",
  )
})

// -------------------------------------------------------------------------
// revalidatePath après écritures
// -------------------------------------------------------------------------

test("R11-01 — createMarketSignal appelle revalidatePath", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function createMarketSignal"),
    SRC.indexOf("async function deleteMarketSignal"),
  )
  assert.ok(
    /revalidatePath/.test(fnBlock),
    "createMarketSignal doit appeler revalidatePath",
  )
})

test("R11-01 — createDevelopmentProject appelle revalidatePath", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function createDevelopmentProject"),
    SRC.indexOf("async function updateDevelopmentProject"),
  )
  assert.ok(
    /revalidatePath/.test(fnBlock),
    "createDevelopmentProject doit appeler revalidatePath",
  )
})

// -------------------------------------------------------------------------
// Exports attendus
// -------------------------------------------------------------------------

test("R11-01 — les 5 actions requises sont exportées", () => {
  const exports = [
    "createMarketSignal",
    "deleteMarketSignal",
    "createDevelopmentProject",
    "updateDevelopmentProject",
    "deleteDevelopmentProject",
  ]
  for (const fn of exports) {
    assert.ok(SRC.includes(`export async function ${fn}`), `${fn} doit être export`)
  }
})
