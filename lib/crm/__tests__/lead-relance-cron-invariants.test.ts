/**
 * CRM / Leads — Relance cron (CRM-RELANCE-CRON-01). Invariants statiques purs,
 * sans DB, sans Inngest. Même pattern que lead-stats-invariants.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"

type LeadStatus = "new" | "contacted" | "converted" | "closed"

interface LeadLike {
  status: LeadStatus
  updatedAt: Date
}

interface Settings {
  thresholdDays: number
  isEnabled: boolean
}

function isLeadStale(lead: LeadLike, settings: Settings, now: Date): boolean {
  if (!settings.isEnabled) return false
  if (lead.status !== "new") return false
  const ageMs = now.getTime() - lead.updatedAt.getTime()
  return ageMs > settings.thresholdDays * 86_400_000
}

const NOW = new Date("2026-01-10T12:00:00Z")
const DEFAULT_SETTINGS: Settings = { thresholdDays: 3, isEnabled: true }

test("cron: lead new > seuil → stale", () => {
  const lead = { status: "new" as const, updatedAt: new Date("2026-01-05T12:00:00Z") } // 5j
  assert.equal(isLeadStale(lead, DEFAULT_SETTINGS, NOW), true)
})

test("cron: lead new < seuil → pas stale", () => {
  const lead = { status: "new" as const, updatedAt: new Date("2026-01-09T12:00:00Z") } // 1j
  assert.equal(isLeadStale(lead, DEFAULT_SETTINGS, NOW), false)
})

test("cron: lead non-new très ancien → jamais stale", () => {
  const old = new Date("2025-01-01T00:00:00Z")
  for (const status of ["contacted", "converted", "closed"] as const) {
    assert.equal(isLeadStale({ status, updatedAt: old }, DEFAULT_SETTINGS, NOW), false, `status=${status}`)
  }
})

test("cron: relance désactivée → jamais stale", () => {
  const lead = { status: "new" as const, updatedAt: new Date("2020-01-01T00:00:00Z") }
  assert.equal(isLeadStale(lead, { thresholdDays: 3, isEnabled: false }, NOW), false)
})

test("cron: seuil élevé désactive le déclenchement précoce", () => {
  const lead = { status: "new" as const, updatedAt: new Date("2026-01-05T12:00:00Z") } // 5j
  assert.equal(isLeadStale(lead, { thresholdDays: 10, isEnabled: true }, NOW), false)
})
