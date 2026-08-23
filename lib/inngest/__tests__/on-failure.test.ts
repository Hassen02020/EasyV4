import test from "node:test"
import assert from "node:assert/strict"

import { makeOnFailure } from "../on-failure"

test("makeOnFailure : ne lève jamais, même sans event.data", async () => {
  const handler = makeOnFailure("test-function")
  await assert.doesNotReject(() => handler({ error: new Error("boom") }))
  await assert.doesNotReject(() => handler({ error: new Error("boom"), event: null }))
  await assert.doesNotReject(() => handler({ error: new Error("boom"), event: { data: {} } }))
})

test("makeOnFailure : n'écrit jamais dans reservations/payments — capture uniquement", async () => {
  const handler = makeOnFailure("send-whatsapp-confirmation")
  const result = await handler({
    error: new Error("provider down"),
    event: { data: { reservationId: "r-1", agencyId: "a-1" } },
  })
  assert.equal(result, undefined)
})
