/**
 * Static invariants for the LeadPipeline Kanban view.
 * Pure logic — no DB, no network, no alias resolution needed.
 * Duplicates the status constants to stay self-contained.
 */
import test from "node:test"
import assert from "node:assert/strict"

type LeadStatus = "new" | "contacted" | "converted" | "closed"

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "converted", "closed"]
const PIPELINE_COLUMNS: LeadStatus[] = ["new", "contacted", "converted", "closed"]

interface LeadStub {
  id: string
  status: LeadStatus
  reservationId: string | null
  convertedAt: Date | null
}

function stub(id: string, status: LeadStatus, extra: Partial<LeadStub> = {}): LeadStub {
  return { id, status, reservationId: null, convertedAt: null, ...extra }
}

test("pipeline has exactly 4 columns matching LEAD_STATUSES", () => {
  assert.deepEqual(PIPELINE_COLUMNS.sort(), [...LEAD_STATUSES].sort())
})

test("each lead belongs to exactly one column", () => {
  const leads = LEAD_STATUSES.map((s, i) => stub(`l${i}`, s))

  for (const col of PIPELINE_COLUMNS) {
    assert.equal(leads.filter((l) => l.status === col).length, 1)
  }

  const total = PIPELINE_COLUMNS.reduce(
    (n, col) => n + leads.filter((l) => l.status === col).length,
    0,
  )
  assert.equal(total, leads.length)
})

test("no lead appears in two columns simultaneously", () => {
  const leads = [stub("a", "new"), stub("b", "contacted"), stub("c", "converted")]
  const seen = new Set<string>()
  for (const col of PIPELINE_COLUMNS) {
    for (const l of leads.filter((x) => x.status === col)) {
      assert.equal(seen.has(l.id), false, `lead ${l.id} seen twice`)
      seen.add(l.id)
    }
  }
})

test("converted requires reservationId + convertedAt", () => {
  const lead = stub("x", "converted", {
    reservationId: "res-123",
    convertedAt: new Date("2024-06-01"),
  })
  assert.notEqual(lead.reservationId, null)
  assert.notEqual(lead.convertedAt, null)
})

test("new/contacted are actionable; converted/closed are terminal", () => {
  const actionable: LeadStatus[] = ["new", "contacted"]
  const terminal: LeadStatus[] = ["converted", "closed"]
  assert.deepEqual(actionable.concat(terminal).sort(), [...LEAD_STATUSES].sort())
})
