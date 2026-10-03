/**
 * MARGINS-COMPLETE-01 — static invariants
 *
 * Pure node:test checks — no @/ imports, no DB, no runtime.
 * Verify: "car" in MarginModule, MARGIN_MODULES, DEFAULT_MARGINS (isActive=false),
 *         "network" in MODULE_LABELS, cars/pricing uses getMarginsForAgency.
 */

import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(__dirname, "../../..")

function src(rel: string) {
  return readFileSync(resolve(root, rel), "utf8")
}

// --- lib/pro/pricing.ts ---

test("MarginModule includes car", () => {
  const text = src("lib/pro/pricing.ts")
  assert.ok(
    /export type MarginModule = .*"car"/.test(text),
    'MarginModule must include "car"',
  )
})

test("DEFAULT_MARGINS has car entry with isActive: false", () => {
  const text = src("lib/pro/pricing.ts")
  // Check that car appears in DEFAULT_MARGINS and is inactive
  assert.ok(
    /car:\s*\{[^}]*isActive:\s*false/.test(text),
    "DEFAULT_MARGINS.car must have isActive: false",
  )
})

// --- lib/pro/server-context.ts ---

test("MARGIN_MODULES includes car", () => {
  const text = src("lib/pro/server-context.ts")
  assert.ok(
    /new Set<string>\(\[[\s\S]*"car"[\s\S]*\]\)/.test(text),
    'MARGIN_MODULES must include "car"',
  )
})

// --- lib/cars/pricing.ts ---

test("cars/pricing does not import pricingMargins", () => {
  const text = src("lib/cars/pricing.ts")
  assert.ok(
    !text.includes("pricingMargins"),
    "cars/pricing must not import pricingMargins directly",
  )
})

test("cars/pricing does not import withTenantContext", () => {
  const text = src("lib/cars/pricing.ts")
  assert.ok(
    !text.includes("withTenantContext"),
    "cars/pricing must not import withTenantContext",
  )
})

test("cars/pricing imports getMarginsForAgency", () => {
  const text = src("lib/cars/pricing.ts")
  assert.ok(
    text.includes('getMarginsForAgency'),
    "cars/pricing must import getMarginsForAgency",
  )
})

test("cars/pricing uses getMarginsForAgency for car margin", () => {
  const text = src("lib/cars/pricing.ts")
  assert.ok(
    /getMarginsForAgency\(input\.agencyId,\s*undefined,\s*input\.channel\s*\?\?\s*"direct"\s*\)\s*\n?\s*\)\.car/.test(text),
    "cars/pricing must call getMarginsForAgency(...).car",
  )
})

test("CarPricingInput has optional channel field", () => {
  const text = src("lib/cars/pricing.ts")
  assert.ok(
    /channel\?:\s*DistributionChannel/.test(text),
    "CarPricingInput must have optional channel?: DistributionChannel",
  )
})

// --- components/admin/pricing-margins-manager.tsx ---

test("MODULE_LABELS includes network", () => {
  const text = src("components/admin/pricing-margins-manager.tsx")
  assert.ok(
    /network:\s*["']Produits Réseau["']/.test(text),
    'MODULE_LABELS must include network: "Produits Réseau"',
  )
})
