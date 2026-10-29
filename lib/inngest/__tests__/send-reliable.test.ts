/**
 * INNGEST-RELIABILITY-01 — tests de la fonction RÉELLE sendEventReliable
 * (lib/inngest/send-reliable.ts), avec dépendances injectées : aucun Inngest,
 * aucune base. (Le test G13 historique, inngest-reliability.test.ts, vérifie
 * une copie locale de la logique du vol, pas la fonction livrée.)
 */
import test from "node:test"
import assert from "node:assert/strict"

import {
  sendEventReliable,
  reliableEventId,
  INNGEST_DISPATCH_MAX_ATTEMPTS,
  type FailedDispatchRecord,
} from "../send-reliable"

const CTX = {
  reservationId: "11111111-1111-4111-8111-111111111111",
  agencyId: "22222222-2222-4222-8222-222222222222",
}
const DATA = {
  reservationId: CTX.reservationId,
  publicRef: "TR-2026-000001",
  agencyId: CTX.agencyId,
  customerEmail: "client.secret@example.test",
  customerPhone: "20000000",
  fromZone: "A",
  toZone: "B",
  pickupAt: "2027-03-01T13:30:00.000Z",
  vehicleType: "van",
  totalTnd: 120,
}

function harness() {
  const sent: Array<{ id: string; name: string; data: unknown }> = []
  const delays: number[] = []
  const records: FailedDispatchRecord[] = []
  const logs: string[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  }
  return {
    sent,
    delays,
    records,
    logs,
    restore: () => {
      console.error = originalError
    },
    deps: (failTimes: number, recordFails = false) => {
      let calls = 0
      return {
        send: async (event: { id: string; name: string; data: unknown }) => {
          calls++
          sent.push(event)
          if (calls <= failTimes) throw new Error("inngest unavailable")
        },
        sleep: async (ms: number) => {
          delays.push(ms)
        },
        record: async (r: FailedDispatchRecord) => {
          if (recordFails) throw new Error("db down")
          records.push(r)
        },
      }
    },
  }
}

test("succès au premier essai : un seul envoi, aucune trace, id stable", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    DATA,
    CTX,
    h.deps(0),
  )
  assert.deepEqual(r, {
    ok: true,
    attempts: 1,
    eventId: `booking/transfer.confirmed:${CTX.reservationId}`,
  })
  assert.equal(h.sent.length, 1)
  assert.equal(
    h.sent[0]?.id,
    reliableEventId("booking/transfer.confirmed", CTX.reservationId),
  )
  assert.equal(h.records.length, 0)
  assert.equal(h.logs.length, 0)
})

test("échec puis succès : retry avec backoff, aucune trace", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    DATA,
    CTX,
    h.deps(1),
  )
  assert.equal(r.ok, true)
  assert.equal(r.attempts, 2)
  assert.deepEqual(h.delays, [100])
  assert.equal(h.sent.length, 2)
  assert.equal(h.records.length, 0)
  // Même id sur chaque tentative (déduplication Inngest).
  assert.equal(h.sent[0]?.id, h.sent[1]?.id)
})

test("échec définitif : 3 tentatives, backoff 100/200 ms, trace durable avec la charge utile, ne lève jamais", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    DATA,
    CTX,
    h.deps(99),
  )
  assert.equal(r.ok, false)
  assert.equal(r.attempts, INNGEST_DISPATCH_MAX_ATTEMPTS)
  assert.equal(h.sent.length, INNGEST_DISPATCH_MAX_ATTEMPTS)
  assert.deepEqual(h.delays, [100, 200])
  assert.equal(r.ok === false && r.traced, true)

  assert.equal(h.records.length, 1)
  const rec = h.records[0]!
  assert.equal(rec.reservationId, CTX.reservationId)
  assert.equal(rec.agencyId, CTX.agencyId)
  assert.equal(rec.eventName, "booking/transfer.confirmed")
  assert.deepEqual(rec.payload, DATA)
  assert.equal(rec.attempts, 3)
  assert.match(rec.error, /inngest unavailable/)
})

test("le journal structuré ne contient NI la charge utile NI l'email du client", async (t) => {
  const h = harness()
  t.after(h.restore)
  await sendEventReliable("booking/transfer.confirmed", DATA, CTX, h.deps(99))
  assert.equal(h.logs.length, 1)
  const line = h.logs[0]!
  const parsed = JSON.parse(line)
  assert.equal(parsed.tag, "INNGEST_DISPATCH_FAILURE")
  assert.equal(parsed.reservationId, CTX.reservationId)
  assert.equal(parsed.event, "booking/transfer.confirmed")
  assert.doesNotMatch(line, /client\.secret@example\.test/)
  assert.doesNotMatch(line, /20000000/)
  assert.equal("payload" in parsed, false)
})

test("la trace durable elle-même en échec : ne lève pas, traced=false, dernier recours journalisé", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    DATA,
    CTX,
    h.deps(99, true),
  )
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.traced, false)
  assert.ok(
    h.logs.some((l) => l.includes("INNGEST_DISPATCH_TRACE_FAILURE")),
    "l'échec de trace doit être journalisé",
  )
})

test("id d'événement : stable par (événement, réservation), distinct sinon", () => {
  const a = reliableEventId("booking/car.confirmed", "r1")
  assert.equal(a, reliableEventId("booking/car.confirmed", "r1"))
  assert.notEqual(a, reliableEventId("booking/car.confirmed", "r2"))
  assert.notEqual(a, reliableEventId("booking/omra.confirmed", "r1"))
})

test("eventKeyConfigured reflète INNGEST_EVENT_KEY sans jamais en exposer la valeur", async (t) => {
  const h = harness()
  t.after(h.restore)
  const prev = process.env.INNGEST_EVENT_KEY
  t.after(() => {
    if (prev === undefined) delete process.env.INNGEST_EVENT_KEY
    else process.env.INNGEST_EVENT_KEY = prev
  })

  delete process.env.INNGEST_EVENT_KEY
  await sendEventReliable("booking/transfer.confirmed", DATA, CTX, h.deps(99))
  assert.equal(h.records.at(-1)?.eventKeyConfigured, false)

  process.env.INNGEST_EVENT_KEY = "evt_key_super_secret_value"
  await sendEventReliable("booking/transfer.confirmed", DATA, CTX, h.deps(99))
  assert.equal(h.records.at(-1)?.eventKeyConfigured, true)
  assert.ok(
    !h.logs.some((l) => l.includes("evt_key_super_secret_value")),
    "la valeur de la clé ne doit jamais apparaître dans les journaux",
  )
  assert.ok(
    !JSON.stringify(h.records).includes("evt_key_super_secret_value"),
    "la valeur de la clé ne doit jamais être persistée",
  )
})
