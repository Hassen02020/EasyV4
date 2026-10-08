/**
 * WHITE-LABEL-ADMIN-01 — static invariants
 *
 * Pure node:test checks — no @/ imports, no DB, no runtime.
 * Verifies: updateAgencyWhiteLabel exists in agencies-actions,
 * AgencyWhiteLabelForm component exists, detail page exists,
 * HEX and DOMAIN regex patterns in the action.
 */

import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(__dirname, "../../..")

function src(rel: string) {
  return readFileSync(resolve(root, rel), "utf8")
}

// --- lib/admin/agencies-actions.ts ---

test("agencies-actions exports updateAgencyWhiteLabel", () => {
  const text = src("lib/admin/agencies-actions.ts")
  assert.ok(
    text.includes("export async function updateAgencyWhiteLabel"),
    "must export updateAgencyWhiteLabel",
  )
})

test("updateAgencyWhiteLabel validates hex color with regex", () => {
  const text = src("lib/admin/agencies-actions.ts")
  assert.ok(
    /HEX_COLOR_REGEX/.test(text),
    "must use HEX_COLOR_REGEX for primaryColor validation",
  )
})

test("updateAgencyWhiteLabel validates domain with regex", () => {
  const text = src("lib/admin/agencies-actions.ts")
  assert.ok(
    /DOMAIN_REGEX/.test(text),
    "must use DOMAIN_REGEX for domain validation",
  )
})

test("updateAgencyWhiteLabel handles domain uniqueness conflict (23505)", () => {
  const text = src("lib/admin/agencies-actions.ts")
  assert.ok(
    text.includes('"23505"') || text.includes("'23505'"),
    "must handle pg error code 23505 (unique constraint violation)",
  )
  assert.ok(
    text.includes("domaine est déjà utilisé"),
    "must return friendly error for duplicate domain",
  )
})

test("updateAgencyWhiteLabel writes audit event agency.white_label_updated", () => {
  const text = src("lib/admin/agencies-actions.ts")
  assert.ok(
    text.includes('"agency.white_label_updated"'),
    'must write audit event "agency.white_label_updated"',
  )
})

// --- components/admin/agency-wl-form.tsx ---

test("AgencyWhiteLabelForm component exists", () => {
  const text = src("components/admin/agency-wl-form.tsx")
  assert.ok(
    text.includes("export function AgencyWhiteLabelForm"),
    "must export AgencyWhiteLabelForm",
  )
})

test("AgencyWhiteLabelForm calls updateAgencyWhiteLabel", () => {
  const text = src("components/admin/agency-wl-form.tsx")
  assert.ok(
    text.includes("updateAgencyWhiteLabel"),
    "must call updateAgencyWhiteLabel",
  )
})

// --- app/(internal)/admin/agencies/[id]/page.tsx ---

test("agency detail page exists and guards super_admin", () => {
  const text = src("app/(internal)/admin/agencies/[id]/page.tsx")
  assert.ok(text.includes("super_admin"), "must check super_admin role")
})

test("agency detail page renders AgencyWhiteLabelForm", () => {
  const text = src("app/(internal)/admin/agencies/[id]/page.tsx")
  assert.ok(
    text.includes("AgencyWhiteLabelForm"),
    "must render AgencyWhiteLabelForm",
  )
})

// --- components/admin/agencies-data-table.tsx ---

test("agencies-data-table has White Label link to [id]", () => {
  const text = src("components/admin/agencies-data-table.tsx")
  assert.ok(
    text.includes("/admin/agencies/${agency.id}") ||
      text.includes("`/admin/agencies/${agency.id}`"),
    "must have link to /admin/agencies/[id]",
  )
})
