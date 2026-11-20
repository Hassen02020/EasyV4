/**
 * GUEST-IDEMPOTENCY-01 (pilote Transferts) — preuves sur PostgreSQL RÉEL,
 * rôle app_runtime (non-BYPASSRLS), sans Redis, sans fournisseur externe.
 * Les tests sont ignorés (skip) sans DATABASE_URL joignable.
 *
 * Matrices couvertes : ID-1..6 (un jeton = une tentative, une identité, un
 * contenu), TT-1..6 / GG-1..5 (deux onglets ancien/nouveau, mode double,
 * mode d'application, rejeu d'avant déploiement), mode off inchangé.
 */
import test, { before } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  catalogTransferPricing,
  catalogTransferZones,
  reservations,
} from "@/lib/db/schema"
import { issueAttemptToken } from "@/lib/booking/attempt-token"
import type {
  CreateGuestTransferBookingResult,
  GuestTransferBookingInput,
} from "../guest-booking-actions"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})
const skip = () => "Postgres indisponible (DATABASE_URL)"

const agencyId = randomUUID()
const fromZoneId = randomUUID()
const toZoneId = randomUUID()
let create: (
  i: GuestTransferBookingInput,
) => Promise<CreateGuestTransferBookingResult>

async function setup(t: TestContext) {
  t.mock.module("@/lib/agencies/default-agency", {
    namedExports: { getDefaultAgencyId: async () => agencyId },
  })
  ;({ createGuestTransferBooking: create } =
    await import("../guest-booking-actions"))
}

let seeded = false
async function seed() {
  if (seeded) return
  seeded = true
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `idem-${agencyId.slice(0, 8)}`,
      name: "GUEST-IDEMPOTENCY-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(catalogTransferZones).values([
      { id: fromZoneId, agencyId, name: "Aéroport test", zoneType: "airport" },
      { id: toZoneId, agencyId, name: "Hôtel test", zoneType: "hotel" },
    ])
    await tx.insert(catalogTransferPricing).values({
      agencyId,
      fromZoneId,
      toZoneId,
      vehicleType: "sedan",
      basePriceTnd: "50.00",
    })
  })
}

let n = 0
/** Une demande au contenu unique (date distincte) pour isoler les tests. */
function fresh(over: Partial<GuestTransferBookingInput> = {}) {
  n += 1
  const d = String(1 + (n % 28)).padStart(2, "0")
  const m = String(1 + Math.floor(n / 28)).padStart(2, "0")
  const phone = `2${String(10000000 + n)}`
  return {
    fromZoneId,
    toZoneId,
    vehicleType: "sedan",
    pickupDate: `2028-${m}-${d}`,
    pickupTime: "10:00",
    pax: 2,
    customer: {
      firstName: "Test",
      lastName: "Idem",
      phone,
      email: `idem-${n}@example.test`,
    },
    ...over,
  } as GuestTransferBookingInput
}
const tok = () => issueAttemptToken("transfer", agencyId)

async function rowsForPhone(phone: string) {
  return withSystemContext((db) =>
    db.execute(sql`
      SELECT r.id, r.status, r.guest_idempotency_key AS key
      FROM reservations r JOIN customers c ON c.id = r.customer_id
      WHERE r.agency_id = ${agencyId} AND c.phone = ${phone}`),
  )
}
const count = async (phone: string) => (await rowsForPhone(phone)).length

function mode(m: "off" | "dual" | "enforce") {
  process.env.GUEST_ATTEMPT_TOKEN_MODE = m
}

test("ID-1 : un jeton, mêmes données, 20 requêtes simultanées → 1 ligne, 20 réponses identiques", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const attemptToken = tok()
  const results = await Promise.all(
    Array.from({ length: 20 }, () => create({ ...base, attemptToken })),
  )
  assert.ok(
    results.every((r) => r.ok),
    JSON.stringify(results.find((r) => !r.ok)),
  )
  const ids = new Set(results.map((r) => r.ok && r.reservationId))
  assert.equal(ids.size, 1)
  assert.equal(await count(base.customer.phone), 1)
})

test("ID-2/ID-6 : même jeton, identité différente → refus, 0 ligne de plus, aucune donnée renvoyée", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const attemptToken = tok()
  const first = await create({ ...base, attemptToken })
  assert.ok(first.ok)
  const other = await create({
    ...base,
    attemptToken,
    customer: { ...base.customer, email: "autre@example.test" },
  })
  assert.equal(other.ok, false)
  assert.ok(!other.ok && other.code === "TOKEN_REUSED")
  assert.ok(!("guestAccessToken" in other) && !("publicRef" in other))
  // même téléphone, autre e-mail : l'identité inclut e-mail ET téléphone
  assert.equal(await count(base.customer.phone), 1)
})

test("ID-3 : même jeton, contenu différent après succès → refus, 0 ligne de plus", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const attemptToken = tok()
  assert.ok((await create({ ...base, attemptToken })).ok)
  const changed = await create({ ...base, attemptToken, pax: 3 })
  assert.ok(!changed.ok && changed.code === "TOKEN_REUSED")
  assert.equal(await count(base.customer.phone), 1)
})

test("ID-4 : échec de validation (prix changé) ne consomme pas le jeton ; correction acceptée", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const attemptToken = tok()
  const bad = await create({ ...base, attemptToken, expectedTotalTnd: 1 })
  assert.ok(!bad.ok && bad.code === "PRICE_CHANGED")
  assert.equal(await count(base.customer.phone), 0)
  const good = await create({ ...base, attemptToken })
  assert.ok(good.ok)
  assert.equal(await count(base.customer.phone), 1)
})

test("ID-5 : jeton d'une autre organisation, falsifié ou expiré → refus, rien créé", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const foreign = issueAttemptToken("transfer", randomUUID())
  const expired = issueAttemptToken(
    "transfer",
    agencyId,
    Date.now() - 3 * 3600_000,
  )
  for (const attemptToken of [foreign, expired, "n.importe.quoi"]) {
    const r = await create({ ...base, attemptToken })
    assert.ok(!r.ok && /^TOKEN_/.test(r.code ?? ""), JSON.stringify(r))
  }
  assert.equal(await count(base.customer.phone), 0)
})

test("TT-5 + D9 : deux jetons, même contenu et identité → avertissement, puis création confirmée", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  assert.ok((await create({ ...base, attemptToken: tok() })).ok)
  const second = await create({ ...base, attemptToken: tok() })
  assert.ok(!second.ok && second.code === "DUPLICATE_CONTENT")
  assert.equal(await count(base.customer.phone), 1)
  const confirmed = await create({
    ...base,
    attemptToken: tok(),
    acknowledgeDuplicate: true,
  })
  assert.ok(confirmed.ok)
  assert.equal(await count(base.customer.phone), 2)
})

test("TT-2/GG-2 : jeton et chemin sans jeton simultanés (mêmes contenu et identité) → 1 seule réservation", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const batch = await Promise.all([
    create({ ...base, attemptToken: tok() }),
    create({ ...base }),
    create({ ...base, attemptToken: tok() }),
    create({ ...base }),
  ])
  assert.equal(await count(base.customer.phone), 1, JSON.stringify(batch))
  const created = new Set(
    batch.filter((r) => r.ok).map((r) => r.ok && r.reservationId),
  )
  assert.equal(created.size, 1)
  assert.ok(
    batch.every((r) => r.ok || r.code === "DUPLICATE_CONTENT"),
    JSON.stringify(batch),
  )
})

test("TT-1/GG-1 : ancien onglet (sans jeton) puis nouvel onglet (jeton), même contenu → pas de doublon silencieux", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  assert.ok((await create({ ...base })).ok)
  const fromNewTab = await create({ ...base, attemptToken: tok() })
  assert.ok(!fromNewTab.ok && fromNewTab.code === "DUPLICATE_CONTENT")
  assert.equal(await count(base.customer.phone), 1)
})

test("GG-3 : rejeu du jeton pendant le mode double → même réservation", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const attemptToken = tok()
  const a = await create({ ...base, attemptToken })
  const b = await create({ ...base, attemptToken })
  assert.ok(a.ok && b.ok && a.reservationId === b.reservationId)
})

test("T1/M2 : sans jeton, création impossible ; rejeu d'une réservation d'avant déploiement avec contrôle d'identité", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  // Réservation « d'avant déploiement » : mode off, sans empreintes.
  mode("off")
  const base = fresh()
  const legacy = await create({ ...base })
  assert.ok(legacy.ok)
  mode("enforce")
  // Nouvelle demande sans jeton → refus, rien créé.
  const fresh2 = fresh()
  const refused = await create({ ...fresh2 })
  assert.ok(!refused.ok && refused.code === "TOKEN_REQUIRED")
  assert.equal(await count(fresh2.customer.phone), 0)
  // Rejeu par l'ancien onglet (même identité) → renvoyée.
  const replay = await create({ ...base })
  assert.ok(
    replay.ok && legacy.ok && replay.reservationId === legacy.reservationId,
  )
  // Même contenu et téléphone, autre e-mail → pas de fuite.
  const intruder = await create({
    ...base,
    customer: { ...base.customer, email: "intrus@example.test" },
  })
  assert.ok(!intruder.ok && intruder.code === "TOKEN_REUSED")
  assert.equal(await count(base.customer.phone), 1)
})

test("Réservation annulée : une nouvelle tentative (autre jeton) est autorisée sans avertissement", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("dual")
  const base = fresh()
  const first = await create({ ...base, attemptToken: tok() })
  assert.ok(first.ok)
  await withSystemContext((db) =>
    db
      .update(reservations)
      .set({ status: "cancelled" })
      .where(and(eq(reservations.id, first.ok ? first.reservationId : ""))),
  )
  assert.ok((await create({ ...base, attemptToken: tok() })).ok)
  assert.equal(await count(base.customer.phone), 2)
})

test("M0 off : comportement historique (pas d'empreinte stockée, jeton ignoré)", async (t) => {
  if (!dbAvailable) return t.skip(skip())
  await seed()
  await setup(t)
  mode("off")
  const base = fresh()
  const a = await create({ ...base, attemptToken: "ignoré" })
  assert.ok(a.ok)
  const rows = await withSystemContext((db) =>
    db.execute(
      sql`SELECT provider_payload ? 'idemContentFp' AS has FROM reservations WHERE id = ${a.ok ? a.reservationId : ""}`,
    ),
  )
  assert.equal((rows[0] as { has: boolean }).has, false)
})
