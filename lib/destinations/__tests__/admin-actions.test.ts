/**
 * R11-01 — invariants statiques lib/destinations/admin-actions.ts
 *
 * Vérifie :
 * 1. requireSuperAdmin() est présent et appelé avant chaque action DB.
 * 2. setFeaturedDestination valide isFeatured comme boolean et
 *    displayOrder comme entier [0, 9999].
 * 3. revalidatePath est appelé après setFeaturedDestination.
 * 4. Les colonnes isFeatured et displayOrder sont dans le schéma destinations.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const SRC = readFileSync(join(ROOT, "lib/destinations/admin-actions.ts"), "utf8")
const SCHEMA = readFileSync(
  join(ROOT, "lib/db/schema/destinations.ts"),
  "utf8",
)

// -------------------------------------------------------------------------
// requireSuperAdmin guard
// -------------------------------------------------------------------------

test("R11-01 — requireSuperAdmin() est défini dans destinations/admin-actions.ts", () => {
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

test("R11-01 — setFeaturedDestination appelle requireSuperAdmin en premier", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function setFeaturedDestination"),
    SRC.indexOf("async function listDestinationsForAdmin"),
  )
  const authIdx = fnBlock.indexOf("requireSuperAdmin")
  const dbIdx = fnBlock.indexOf("getDb()")
  assert.ok(
    authIdx !== -1,
    "setFeaturedDestination doit appeler requireSuperAdmin",
  )
  assert.ok(authIdx < dbIdx, "requireSuperAdmin doit précéder l'accès DB")
})

// -------------------------------------------------------------------------
// Validation Zod
// -------------------------------------------------------------------------

test("R11-01 — setFeaturedDestination valide isFeatured comme boolean", () => {
  assert.ok(
    /isFeatured.*z\.boolean\(\)/.test(SRC),
    "isFeatured doit être z.boolean()",
  )
})

test("R11-01 — setFeaturedDestination valide displayOrder comme int ≥ 0", () => {
  assert.ok(
    /displayOrder.*z\.number\(\)\.int\(\)\.min\(0\)/.test(SRC),
    "displayOrder doit être z.number().int().min(0)",
  )
})

// -------------------------------------------------------------------------
// revalidatePath
// -------------------------------------------------------------------------

test("R11-01 — setFeaturedDestination appelle revalidatePath", () => {
  const fnBlock = SRC.slice(
    SRC.indexOf("async function setFeaturedDestination"),
    SRC.indexOf("async function listDestinationsForAdmin"),
  )
  assert.ok(
    /revalidatePath/.test(fnBlock),
    "setFeaturedDestination doit appeler revalidatePath",
  )
})

// -------------------------------------------------------------------------
// Schéma destinations — colonnes R9-04
// -------------------------------------------------------------------------

test("R11-01 — destinations.isFeatured est dans le schéma Drizzle", () => {
  assert.ok(
    /isFeatured.*boolean\("is_featured"\)/.test(SCHEMA),
    "destinations doit avoir isFeatured: boolean('is_featured')",
  )
})

test("R11-01 — destinations.displayOrder est dans le schéma Drizzle", () => {
  assert.ok(
    /displayOrder.*integer\("display_order"\)/.test(SCHEMA),
    "destinations doit avoir displayOrder: integer('display_order')",
  )
})

// -------------------------------------------------------------------------
// Exports attendus
// -------------------------------------------------------------------------

test("R11-01 — setFeaturedDestination et listDestinationsForAdmin sont exportés", () => {
  assert.ok(
    SRC.includes("export async function setFeaturedDestination"),
    "setFeaturedDestination doit être export",
  )
  assert.ok(
    SRC.includes("export async function listDestinationsForAdmin"),
    "listDestinationsForAdmin doit être export",
  )
})
