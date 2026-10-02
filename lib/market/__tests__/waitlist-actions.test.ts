/**
 * R10-01 — tests unitaires lib/market/waitlist-actions.ts
 *
 * Teste _insertWaitlistEntry (helper testable) et les chemins de validation
 * de submitWaitlistEntry sans appel réseau réel.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  _insertWaitlistEntry,
  submitWaitlistEntry,
} from "../waitlist-actions.js"

// -------------------------------------------------------------------------
// Mock DB builder
// -------------------------------------------------------------------------

type InsertCall = {
  values: Record<string, unknown>
  conflictMode: "doNothing" | null
}

function makeMockDb(calls: InsertCall[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    insert: (_: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          calls.push({ values: v, conflictMode: "doNothing" })
          return Promise.resolve([])
        },
      }),
    }),
  } as unknown as Parameters<typeof _insertWaitlistEntry>[1]
}

// -------------------------------------------------------------------------
// Tests — _insertWaitlistEntry
// -------------------------------------------------------------------------

test("R10-01 — inserts entry and returns ok:true", async () => {
  const calls: InsertCall[] = []
  const db = makeMockDb(calls)
  const result = await _insertWaitlistEntry(
    {
      projectId: "00000000-0000-0000-0000-000000000001",
      email: "User@Example.COM",
      locale: "fr",
    },
    db,
  )
  assert.deepEqual(result, { ok: true })
  assert.equal(calls.length, 1)
})

test("R10-01 — email is lowercased before insert", async () => {
  const calls: InsertCall[] = []
  const db = makeMockDb(calls)
  await _insertWaitlistEntry(
    {
      projectId: "00000000-0000-0000-0000-000000000002",
      email: "  ALICE@EXAMPLE.COM  ",
      locale: "en",
    },
    db,
  )
  assert.equal(calls[0].values.email, "alice@example.com")
})

test("R10-01 — uses onConflictDoNothing (idempotent)", async () => {
  const calls: InsertCall[] = []
  const db = makeMockDb(calls)
  await _insertWaitlistEntry(
    {
      projectId: "00000000-0000-0000-0000-000000000003",
      email: "bob@example.com",
      locale: "ar",
    },
    db,
  )
  assert.equal(calls[0].conflictMode, "doNothing")
})

// -------------------------------------------------------------------------
// Tests — submitWaitlistEntry (validation)
// -------------------------------------------------------------------------

test("R10-01 — submitWaitlistEntry rejects missing projectId", async () => {
  const result = await submitWaitlistEntry({
    email: "test@example.com",
    locale: "fr",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "invalid_input")
})

test("R10-01 — submitWaitlistEntry rejects invalid email", async () => {
  const result = await submitWaitlistEntry({
    projectId: "00000000-0000-0000-0000-000000000001",
    email: "not-an-email",
    locale: "fr",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "invalid_input")
})

test("R10-01 — submitWaitlistEntry rejects non-uuid projectId", async () => {
  const result = await submitWaitlistEntry({
    projectId: "bad-id",
    email: "test@example.com",
    locale: "fr",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, "invalid_input")
})
