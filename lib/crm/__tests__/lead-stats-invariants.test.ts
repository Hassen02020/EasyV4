/**
 * CRM-STATS-01 — invariants statiques pour le calcul des KPI CRM.
 * Autonome : pas d'imports @/ (même pattern que les autres tests CRM).
 */
import test from "node:test"
import assert from "node:assert/strict"

type LeadStatus = "new" | "contacted" | "converted" | "closed"

interface LeadRow {
  id: string
  agencyId: string
  status: LeadStatus
  updatedAt: Date
  staffNotes: string | null
}

interface LeadRelanceSettingsValue {
  thresholdDays: number
  isEnabled: boolean
}

function isLeadStale(
  lead: LeadRow,
  settings: LeadRelanceSettingsValue,
  now: Date = new Date(),
): boolean {
  if (!settings.isEnabled) return false
  if (lead.status !== "new") return false
  return (
    now.getTime() - lead.updatedAt.getTime() >
    settings.thresholdDays * 86_400_000
  )
}

function computeStats(
  leads: LeadRow[],
  relanceSettings: LeadRelanceSettingsValue,
) {
  const byStatus: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    converted: 0,
    closed: 0,
  }
  let stale = 0
  for (const lead of leads) {
    byStatus[lead.status]++
    if (isLeadStale(lead, relanceSettings)) stale++
  }
  const active = byStatus.new + byStatus.contacted + byStatus.converted
  const convRate =
    active > 0 ? Math.round((byStatus.converted / active) * 100) : 0
  return { byStatus, stale, convRate, total: leads.length }
}

const settings: LeadRelanceSettingsValue = { thresholdDays: 3, isEnabled: true }

function makeRow(id: string, status: LeadStatus, daysOld = 0): LeadRow {
  const d = new Date()
  d.setDate(d.getDate() - daysOld)
  return { id, agencyId: "a1", status, updatedAt: d, staffNotes: null }
}

// ── 1. Totaux cohérents ──────────────────────────────────────────────────────
test("total equals sum of per-status counts", () => {
  const leads = [
    makeRow("1", "new"),
    makeRow("2", "contacted"),
    makeRow("3", "converted"),
    makeRow("4", "closed"),
    makeRow("5", "new"),
  ]
  const stats = computeStats(leads, settings)
  const sum =
    stats.byStatus.new +
    stats.byStatus.contacted +
    stats.byStatus.converted +
    stats.byStatus.closed
  assert.equal(sum, stats.total)
  assert.equal(stats.total, 5)
})

// ── 2. Taux de conversion : 0 si aucun actif ────────────────────────────────
test("conversion rate is 0 when all leads are closed", () => {
  const leads = [makeRow("1", "closed"), makeRow("2", "closed")]
  const stats = computeStats(leads, settings)
  assert.equal(stats.convRate, 0)
})

// ── 3. Taux de conversion sur actifs seulement ──────────────────────────────
test("conversion rate ignores closed leads — 1 converted out of 2 active = 50 %", () => {
  const leads = [
    makeRow("1", "new"),
    makeRow("2", "converted"),
    makeRow("3", "closed"),
  ]
  const stats = computeStats(leads, settings)
  assert.equal(stats.convRate, 50)
})

// ── 4. Stale : seulement les "new" anciens ───────────────────────────────────
test("stale count includes only new leads older than threshold", () => {
  const leads = [
    makeRow("old-new", "new", 5), // stale (5 > 3 days)
    makeRow("fresh-new", "new", 1), // not stale
    makeRow("contacted", "contacted", 5), // not stale (non-new)
    makeRow("converted", "converted", 5), // not stale
  ]
  const stats = computeStats(leads, settings)
  assert.equal(stats.stale, 1)
})

// ── 5. Stale = 0 si relance désactivée ──────────────────────────────────────
test("stale count is 0 when relance is disabled", () => {
  const leads = [makeRow("1", "new", 10), makeRow("2", "new", 7)]
  const stats = computeStats(leads, { thresholdDays: 3, isEnabled: false })
  assert.equal(stats.stale, 0)
})

// ── 6. Liste vide ────────────────────────────────────────────────────────────
test("empty lead list yields zero stats", () => {
  const stats = computeStats([], settings)
  assert.equal(stats.total, 0)
  assert.equal(stats.stale, 0)
  assert.equal(stats.convRate, 0)
  assert.equal(stats.byStatus.new, 0)
})
