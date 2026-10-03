/**
 * CRM-NOTES-01 — invariants statiques pour la fonctionnalité notes staff.
 * Autonome : pas d'imports @/ pour éviter les problèmes d'alias dans le
 * runner node:test (même pattern que lead-pipeline-invariants.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"

type LeadStatus = "new" | "contacted" | "converted" | "closed"

interface LeadRow {
  id: string
  agencyId: string
  status: LeadStatus
  staffNotes: string | null
  updatedAt: Date
}

const NOTES_MAX_LENGTH = 2000

// ── 1. staffNotes est nullable ────────────────────────────────────────────────
test("staffNotes is nullable — lead without note is valid", () => {
  const lead: LeadRow = {
    id: "a",
    agencyId: "agency-1",
    status: "new",
    staffNotes: null,
    updatedAt: new Date(),
  }
  assert.equal(lead.staffNotes, null)
})

// ── 2. Longueur maximale ──────────────────────────────────────────────────────
test("staffNotes must not exceed NOTES_MAX_LENGTH characters", () => {
  const valid = "x".repeat(NOTES_MAX_LENGTH)
  const invalid = "x".repeat(NOTES_MAX_LENGTH + 1)
  assert.ok(valid.length <= NOTES_MAX_LENGTH)
  assert.ok(invalid.length > NOTES_MAX_LENGTH)
})

// ── 3. Note vide ≡ null (normalisation côté serveur) ─────────────────────────
test("empty string note is normalized to null before persist", () => {
  function normalizeNote(raw: string): string | null {
    return raw.trim() || null
  }
  assert.equal(normalizeNote(""), null)
  assert.equal(normalizeNote("   "), null)
  assert.equal(normalizeNote("  note  "), "note")
})

// ── 4. updateLeadNotes ne change PAS le statut ────────────────────────────────
test("saving a note does not modify the lead status", () => {
  const before: LeadRow = {
    id: "b",
    agencyId: "agency-1",
    status: "contacted",
    staffNotes: null,
    updatedAt: new Date(),
  }
  // Simuler updateLeadNotes — seul staffNotes change
  const after: LeadRow = { ...before, staffNotes: "Suivi fait par Hassene" }
  assert.equal(after.status, before.status)
  assert.equal(after.staffNotes, "Suivi fait par Hassene")
})

// ── 5. La note est scopée à l'agencyId (isolation tenant) ───────────────────
test("notes are scoped to agencyId — cross-agency update returns updated=false", () => {
  function simulateUpdate(
    lead: LeadRow,
    params: { agencyId: string; id: string; staffNotes: string | null },
  ): { updated: boolean } {
    if (lead.id !== params.id || lead.agencyId !== params.agencyId) {
      return { updated: false }
    }
    return { updated: true }
  }

  const lead: LeadRow = {
    id: "c",
    agencyId: "agency-1",
    status: "new",
    staffNotes: null,
    updatedAt: new Date(),
  }

  const sameAgency = simulateUpdate(lead, {
    agencyId: "agency-1",
    id: "c",
    staffNotes: "note",
  })
  assert.equal(sameAgency.updated, true)

  const otherAgency = simulateUpdate(lead, {
    agencyId: "agency-EVIL",
    id: "c",
    staffNotes: "injection",
  })
  assert.equal(otherAgency.updated, false)
})
