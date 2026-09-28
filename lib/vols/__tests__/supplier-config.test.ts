/**
 * Unit tests for flight supplier config logic.
 * Tests valid/invalid combinations of display_mode + booking_mode.
 * Pure logic — no DB dependency.
 */
import test from "node:test"
import assert from "node:assert/strict"

// Valid mode combinations per the spec:
//   SITE  + OFFLINE   → human agent uses supplier portal and books manually
//   API   + OFFLINE   → GDS adapter fetches results; human agent books
//   API   + API       → GDS adapter fetches and auto-books
//   API   + AUTOMATIC → GDS adapter fetches, rechecks, and auto-issues
// Invalid:
//   SITE  + API       → cannot auto-book via API when using site display
//   SITE  + AUTOMATIC → same reason

type DisplayMode = "SITE" | "API"
type BookingMode = "OFFLINE" | "API" | "AUTOMATIC"

function isValidModeCombo(display: DisplayMode, booking: BookingMode): boolean {
  if (display === "SITE" && (booking === "API" || booking === "AUTOMATIC")) return false
  return true
}

test("SITE + OFFLINE is valid", () => {
  assert.ok(isValidModeCombo("SITE", "OFFLINE"))
})

test("API + OFFLINE is valid", () => {
  assert.ok(isValidModeCombo("API", "OFFLINE"))
})

test("API + API is valid", () => {
  assert.ok(isValidModeCombo("API", "API"))
})

test("API + AUTOMATIC is valid", () => {
  assert.ok(isValidModeCombo("API", "AUTOMATIC"))
})

test("SITE + API is invalid", () => {
  assert.equal(isValidModeCombo("SITE", "API"), false)
})

test("SITE + AUTOMATIC is invalid", () => {
  assert.equal(isValidModeCombo("SITE", "AUTOMATIC"), false)
})

// Supplier name validation
const VALID_SUPPLIER_NAMES = ["virtual", "amadeus", "travelport", "sabre"] as const
type SupplierName = typeof VALID_SUPPLIER_NAMES[number]

function isKnownSupplier(s: string): s is SupplierName {
  return (VALID_SUPPLIER_NAMES as readonly string[]).includes(s)
}

test("known suppliers are recognised", () => {
  for (const name of VALID_SUPPLIER_NAMES) {
    assert.ok(isKnownSupplier(name), `${name} should be valid`)
  }
})

test("unknown supplier is rejected", () => {
  assert.equal(isKnownSupplier("expedia"), false)
  assert.equal(isKnownSupplier("booking"), false)
  assert.equal(isKnownSupplier(""), false)
})

// displayUrl is required when displayMode = SITE
function validateConfig(cfg: { displayMode: DisplayMode; displayUrl?: string | null }): string[] {
  const errors: string[] = []
  if (cfg.displayMode === "SITE" && !cfg.displayUrl) {
    errors.push("displayUrl is required when displayMode is SITE")
  }
  return errors
}

test("SITE mode without displayUrl produces validation error", () => {
  const errs = validateConfig({ displayMode: "SITE", displayUrl: null })
  assert.equal(errs.length, 1)
})

test("SITE mode with displayUrl is valid", () => {
  const errs = validateConfig({ displayMode: "SITE", displayUrl: "https://gds.example.com" })
  assert.equal(errs.length, 0)
})

test("API mode without displayUrl is valid", () => {
  const errs = validateConfig({ displayMode: "API" })
  assert.equal(errs.length, 0)
})
