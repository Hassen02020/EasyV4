/**
 * INNGEST-RELIABILITY-01 — tests de la fonction RÉELLE sendEventReliable
 * (lib/inngest/send-reliable.ts), avec dépendances injectées : aucun Inngest,
 * aucune base. (Le test G13 historique, inngest-reliability.test.ts, vérifie
 * une copie locale de la logique du vol, pas la fonction livrée.)
 *
 * Confidentialité : la charge utile d'entrée contient volontairement email,
 * téléphone, nom et token ; aucune de ces valeurs ne doit apparaître dans la
 * trace persistée, le journal ni le contexte Sentry.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  sendEventReliable,
  sanitizeErrorMessage,
  reliableEventId,
  INNGEST_DISPATCH_MAX_ATTEMPTS,
  INNGEST_DISPATCH_FAILED_ACTION,
  type FailedDispatchRecord,
} from "../send-reliable"
import type { Events } from "../client"

const RES = "11111111-1111-4111-8111-111111111111"
const AGENCY = "22222222-2222-4222-8222-222222222222"
const CTX = { reservationId: RES, agencyId: AGENCY }

const EMAIL = "client.secret@example.test"
const PHONE = "20123456"
const TOKEN = "tok_7f3c9a1e-aaaa-bbbb-cccc-1234567890ab"
const NAME = "Jean Confidentiel"

/** Un exemple réaliste de charge utile pour chacun des cinq modules. */
const PAYLOADS = {
  "booking/confirmed": {
    reservationId: RES,
    publicRef: "HT-2026-000001",
    agencyId: AGENCY,
    guestAccessToken: TOKEN,
    customerEmail: EMAIL,
    customerName: NAME,
    customerPhone: PHONE,
    hotelName: "Hôtel Test",
    checkIn: "2027-03-01",
    checkOut: "2027-03-04",
    nights: 3,
    adults: 2,
    children: 0,
    totalTnd: 900,
  } satisfies Events["booking/confirmed"]["data"],
  "booking/omra.confirmed": {
    reservationId: RES,
    publicRef: "OM-2026-000001",
    agencyId: AGENCY,
    packageName: "Omra Test",
    pilgrimsCount: 2,
    departureDate: "2027-03-01",
    totalTnd: 2000,
    contactEmail: EMAIL,
  } satisfies Events["booking/omra.confirmed"]["data"],
  "booking/package.confirmed": {
    reservationId: RES,
    publicRef: "PK-2026-000001",
    agencyId: AGENCY,
    packageName: "Istanbul Test",
    departureDate: "2027-05-01",
    paxCount: 3,
    totalTnd: 3000,
    contactEmail: EMAIL,
  } satisfies Events["booking/package.confirmed"]["data"],
  "booking/transfer.confirmed": {
    reservationId: RES,
    publicRef: "TR-2026-000001",
    agencyId: AGENCY,
    customerEmail: EMAIL,
    customerPhone: PHONE,
    fromZone: "A",
    toZone: "B",
    pickupAt: "2027-03-01T13:30:00.000Z",
    vehicleType: "van",
    totalTnd: 120,
  } satisfies Events["booking/transfer.confirmed"]["data"],
  "booking/car.confirmed": {
    reservationId: RES,
    publicRef: "CR-2026-000001",
    agencyId: AGENCY,
    guestAccessToken: TOKEN,
    customerEmail: EMAIL,
    customerName: NAME,
    categoryName: "SUV",
    pickupLocationName: "Aéroport",
    dropoffLocationName: "Sousse",
    pickupAt: "2027-06-01T10:00:00.000Z",
    dropoffAt: "2027-06-05T10:00:00.000Z",
    rentalDays: 4,
    insuranceLevel: "basic",
    totalTnd: 450,
  } satisfies Events["booking/car.confirmed"]["data"],
} as const

const SENSITIVE_VALUES = [EMAIL, PHONE, TOKEN, NAME]

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
    deps: (
      failTimes: number,
      opts: { recordFails?: boolean; leakInError?: boolean } = {},
    ) => {
      let calls = 0
      return {
        send: async (event: { id: string; name: string; data: unknown }) => {
          calls++
          sent.push(event)
          if (calls <= failTimes) {
            // Pire cas : le SDK recopie des valeurs de la charge utile dans
            // son message d'erreur.
            throw new Error(
              opts.leakInError
                ? `HTTP 400 pour ${EMAIL} tel ${PHONE} token ${TOKEN} client ${NAME}`
                : "inngest unavailable",
            )
          }
        },
        sleep: async (ms: number) => {
          delays.push(ms)
        },
        record: async (r: FailedDispatchRecord) => {
          if (opts.recordFails) {
            throw new Error(`db down — params: ${EMAIL} ${TOKEN}`)
          }
          records.push(r)
        },
        timeoutMs: 1000,
      }
    },
  }
}

test("succès au premier essai : un seul envoi, aucune trace, id stable", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(0),
  )
  assert.deepEqual(r, {
    ok: true,
    attempts: 1,
    eventId: `booking/transfer.confirmed:${RES}`,
  })
  assert.equal(h.sent.length, 1)
  assert.equal(h.records.length, 0)
  assert.equal(h.logs.length, 0)
})

test("échec puis succès : retry avec backoff, aucune trace, même id à chaque tentative", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(1),
  )
  assert.equal(r.ok, true)
  assert.equal(r.attempts, 2)
  assert.deepEqual(h.delays, [100])
  assert.equal(h.sent[0]?.id, h.sent[1]?.id)
  assert.equal(h.records.length, 0)
})

test("tentatives BORNÉES : exactement 3 envois et 2 attentes (100, 200 ms), jamais plus", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(99),
  )
  assert.equal(r.ok, false)
  assert.equal(r.attempts, INNGEST_DISPATCH_MAX_ATTEMPTS)
  assert.equal(h.sent.length, 3)
  assert.deepEqual(h.delays, [100, 200])
})

test("un envoi qui ne répond jamais est interrompu par le délai : 3 tentatives puis échec, jamais d'attente infinie", async (t) => {
  const h = harness()
  t.after(h.restore)
  let calls = 0
  const started = Date.now()
  const r = await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    {
      send: () => {
        calls++
        return new Promise(() => {}) // ne se résout jamais
      },
      sleep: async () => {},
      record: async (rec) => {
        h.records.push(rec)
      },
      timeoutMs: 30,
    },
  )
  assert.equal(r.ok, false)
  assert.equal(calls, 3)
  assert.ok(Date.now() - started < 2000)
  assert.match(h.records[0]!.error, /timeout/)
})

test("trace persistée = données techniques uniquement (liste exacte des champs)", async (t) => {
  const h = harness()
  t.after(h.restore)
  await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(99),
  )
  assert.equal(h.records.length, 1)
  assert.deepEqual(
    Object.keys(h.records[0]!).sort(),
    [
      "agencyId",
      "attempts",
      "error",
      "eventId",
      "eventKeyConfigured",
      "eventName",
      "entityId",
      "entityType",
      "failedAt",
    ].sort(),
  )
  assert.equal("payload" in h.records[0]!, false)
})

for (const [name, payload] of Object.entries(PAYLOADS)) {
  test(`${name} : ni email, ni téléphone, ni token, ni nom dans la trace, le journal ni le contexte Sentry (même si l'erreur du SDK les recopie)`, async (t) => {
    const h = harness()
    t.after(h.restore)
    const sentry: unknown[] = []
    const prevDsn = process.env.SENTRY_DSN
    delete process.env.SENTRY_DSN // captureError sans DSN : aucun envoi
    t.after(() => {
      if (prevDsn !== undefined) process.env.SENTRY_DSN = prevDsn
    })

    const r = await sendEventReliable(
      name as keyof Events,
      payload as never,
      CTX,
      h.deps(99, { leakInError: true }),
    )
    assert.equal(r.ok, false)
    const persisted = JSON.stringify(h.records)
    const logged = h.logs.join("\n")
    // Le nom du client ne peut être recopié que s'il figure dans CETTE charge
    // utile ; email, téléphone et token sont couverts par des motifs génériques.
    const own = SENSITIVE_VALUES.filter(
      (v) => v !== NAME || JSON.stringify(payload).includes(NAME),
    )
    for (const secret of own) {
      assert.ok(
        !persisted.includes(secret),
        `${name}: trace contient ${secret}`,
      )
      assert.ok(!logged.includes(secret), `${name}: journal contient ${secret}`)
    }
    assert.equal(sentry.length, 0)
    // La trace garde bien ce qui sert à l'exploitation.
    assert.equal(h.records[0]?.eventName, name)
    assert.equal(h.records[0]?.eventId, `${name}:${RES}`)
    assert.equal(h.records[0]?.entityId, RES)
    assert.equal(h.records[0]?.entityType, "reservation")
    assert.equal(h.records[0]?.agencyId, AGENCY)
  })
}

test("échec de la trace elle-même : ne lève pas, traced=false, journal du dernier recours sans donnée client", async (t) => {
  const h = harness()
  t.after(h.restore)
  const r = await sendEventReliable(
    "booking/car.confirmed",
    PAYLOADS["booking/car.confirmed"],
    CTX,
    h.deps(99, { recordFails: true }),
  )
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.traced, false)
  const logged = h.logs.join("\n")
  assert.ok(logged.includes("INNGEST_DISPATCH_TRACE_FAILURE"))
  assert.ok(!logged.includes(EMAIL))
  assert.ok(!logged.includes(TOKEN))
})

test("déduplication : id stable par (événement, réservation), distinct sinon, et transmis à CHAQUE envoi", async (t) => {
  const h = harness()
  t.after(h.restore)
  const a = reliableEventId("booking/car.confirmed", "r1")
  assert.equal(a, reliableEventId("booking/car.confirmed", "r1"))
  assert.notEqual(a, reliableEventId("booking/car.confirmed", "r2"))
  assert.notEqual(a, reliableEventId("booking/omra.confirmed", "r1"))

  await sendEventReliable(
    "booking/car.confirmed",
    PAYLOADS["booking/car.confirmed"],
    CTX,
    h.deps(0),
  )
  await sendEventReliable(
    "booking/car.confirmed",
    PAYLOADS["booking/car.confirmed"],
    CTX,
    h.deps(0),
  )
  assert.equal(h.sent.length, 2)
  assert.equal(h.sent[0]?.id, `booking/car.confirmed:${RES}`)
  assert.equal(h.sent[0]?.id, h.sent[1]?.id)
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
  await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(99),
  )
  assert.equal(h.records.at(-1)?.eventKeyConfigured, false)

  process.env.INNGEST_EVENT_KEY = "evt_key_super_secret_value"
  await sendEventReliable(
    "booking/transfer.confirmed",
    PAYLOADS["booking/transfer.confirmed"],
    CTX,
    h.deps(99),
  )
  assert.equal(h.records.at(-1)?.eventKeyConfigured, true)
  assert.ok(!h.logs.join("\n").includes("evt_key_super_secret_value"))
  assert.ok(!JSON.stringify(h.records).includes("evt_key_super_secret_value"))
})

test("sanitizeErrorMessage : retire valeurs sensibles et emails, tronque", () => {
  const data = { customerEmail: EMAIL, guestAccessToken: TOKEN, hotelName: "H" }
  const cleaned = sanitizeErrorMessage(
    `échec pour ${EMAIL} avec ${TOKEN}, aussi autre@exemple.tn`,
    data,
  )
  assert.ok(!cleaned.includes(EMAIL))
  assert.ok(!cleaned.includes(TOKEN))
  assert.ok(!cleaned.includes("autre@exemple.tn"))
  assert.ok(sanitizeErrorMessage("x".repeat(1000), data).length <= 301)
})

test("aucun rejeu automatique : l'action de trace n'est lue par aucun code applicatif ni cron", () => {
  const roots = ["lib", "app"]
  const offenders: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(full, "utf8")
        if (
          (src.includes(INNGEST_DISPATCH_FAILED_ACTION) ||
            src.includes("INNGEST_DISPATCH_FAILED_ACTION")) &&
          !full.endsWith(join("inngest", "send-reliable.ts"))
        ) {
          offenders.push(full)
        }
      }
    }
  }
  for (const r of roots) walk(join(process.cwd(), r))
  assert.deepEqual(offenders, [], "un code lit/rejoue les traces d'échec")
})

test("prospect (CRM) : id d'événement par lead, trace entityType=lead, aucune donnée du prospect persistée", async (t) => {
  const h = harness()
  t.after(h.restore)
  const LEAD = "44444444-4444-4444-8444-444444444444"
  const r = await sendEventReliable(
    "crm/lead.created",
    {
      leadId: LEAD,
      agencyId: AGENCY,
      firstName: NAME,
      lastName: null,
      email: EMAIL,
      phone: PHONE,
      message: null,
      productType: "hotel",
      productLabel: null,
      sourcePage: "/hotels/1",
    },
    { leadId: LEAD, agencyId: AGENCY },
    h.deps(99, { leakInError: true }),
  )
  assert.equal(r.eventId, `crm/lead.created:${LEAD}`)
  assert.equal(h.sent[0]?.id, `crm/lead.created:${LEAD}`)
  const rec = h.records[0]!
  assert.equal(rec.entityType, "lead")
  assert.equal(rec.entityId, LEAD)
  const persisted = JSON.stringify(h.records) + h.logs.join("\n")
  for (const secret of [EMAIL, PHONE, NAME]) {
    assert.ok(!persisted.includes(secret), `fuite : ${secret}`)
  }
})
