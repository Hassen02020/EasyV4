/**
 * Tests unitaires cursor-based pagination — reservations-data.
 *
 *   pnpm test
 */

import test from "node:test"
import assert from "node:assert/strict"

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL

async function importFresh() {
  const path = "../reservations-data.ts"
  return import(`${path}?t=${Date.now()}`)
}

test("encodeCursor / decodeCursor round-trip", async () => {
  const mod = await importFresh()
  const cursor = { createdAt: "2026-05-19T08:30:00.000Z", id: "abc-123" }
  const encoded = mod.encodeCursor(cursor)
  assert.equal(typeof encoded, "string")
  assert.ok(encoded.length > 0)

  const decoded = mod.decodeCursor(encoded)
  assert.deepEqual(decoded, cursor)
})

test("decodeCursor returns null for invalid strings", async () => {
  const mod = await importFresh()
  assert.equal(mod.decodeCursor("not-valid-base64!!!"), null)
  assert.equal(mod.decodeCursor(""), null)
  assert.equal(mod.decodeCursor("{}"), null)
})

test("decodeCursor returns null for malformed JSON missing fields", async () => {
  const mod = await importFresh()
  const bad = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url")
  assert.equal(mod.decodeCursor(bad), null)
})

test("loadAdminReservationsPage returns EMPTY_PAGE when DATABASE_URL absent", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    const result = await mod.loadAdminReservationsPage(
      "00000000-0000-0000-0000-000000000001",
      25,
      null,
    )
    assert.equal(result.available, false)
    assert.deepEqual(result.rows, [])
    assert.equal(result.nextCursor, null)
    assert.equal(result.hasMore, false)
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})

test("EMPTY_PAGE shape matches CursorPageResult typing", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    const result = await mod.loadAdminReservationsPage(
      "00000000-0000-0000-0000-000000000001",
    )
    const keys = Object.keys(result).sort()
    assert.deepEqual(keys, ["available", "hasMore", "nextCursor", "rows"])
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})
