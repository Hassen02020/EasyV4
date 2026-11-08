/**
 * SUPPLIER-INCIDENT-TRACE-01 — une réservation fournisseur peut-être encore
 * active sans réservation locale laisse une trace durable (audit_events),
 * écrite HORS de la transaction de réservation annulée.
 *
 *  - confirmHotelWithProvider (faux client myGo) signale l'incident : réponse
 *    perdue non réconciliée → booking_ambiguous ; hôtel confirmé différent →
 *    hotel_mismatch (avec la référence myGo) ; succès → aucun incident.
 *  - recordSupplierIncident (PostgreSQL réel) : la trace survit à
 *    l'annulation d'une transaction englobante ; ne lève jamais.
 *  - Câblage : chaque annulation de rattrapage en échec des parcours hôtel
 *    Tunisie B2C/B2B et Hôtel Monde écrit la trace.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents } from "@/lib/db/schema"
import { MyGoTimeoutError } from "@/lib/mygo/errors"
import type { BookingDraft, TravelerInput } from "../schemas"
import {
  recordSupplierIncident,
  SUPPLIER_INCIDENT_ACTIONS,
  SUPPLIER_INCIDENT_ENTITY_TYPE,
} from "../supplier-incident"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

const draft: BookingDraft = {
  module: "hotel",
  offerId: "123",
  offerLabel: "Hôtel test",
  startDate: "2026-12-20",
  endDate: "2026-12-22",
  adults: 2,
  children: 0,
  unitPriceTnd: 100,
  currency: "TND",
  metadata: {
    myGoToken: "tok",
    cityId: 1,
    hotelId: 123,
    boardingId: 1,
    roomId: 1,
  },
}
const traveler = {
  civility: "M",
  firstName: "Test",
  lastName: "Incident",
  email: "incident@test.local",
  phone: "20000000",
} as unknown as TravelerInput

const confirmation = (hotelId: number) => ({
  bookingId: 987654,
  hotelId,
  rooms: [],
  currency: "TND",
  totalPrice: 200,
})

async function confirmWith(client: Record<string, unknown>) {
  const { confirmHotelWithProvider } = await import("../actions")
  return confirmHotelWithProvider(draft, traveler, {
    client,
  } as unknown as Parameters<typeof confirmHotelWithProvider>[2])
}

// ─── confirmHotelWithProvider ──────────────────────────────────────────────

test("réponse myGo perdue, réconciliation sans résultat → incident booking_ambiguous (référence inconnue)", async () => {
  const r = await confirmWith({
    createBooking: async () => {
      throw new MyGoTimeoutError(15000)
    },
    listBookings: async () => [],
  })
  assert.equal(r.attempted, true)
  assert.ok(r.attempted && !r.ok)
  if (r.attempted && !r.ok) {
    assert.equal(r.kind, "AMBIGUOUS_SUPPLIER_STATE")
    assert.equal(r.incident?.kind, "booking_ambiguous")
    assert.equal(r.incident?.supplierBookingRef, null)
    assert.equal(r.incident?.hotelId, 123)
    assert.ok(r.incident?.error instanceof MyGoTimeoutError)
  }
})

test("myGo confirme un autre hôtel → incident hotel_mismatch avec la référence myGo", async () => {
  const r = await confirmWith({
    createBooking: async () => confirmation(999),
    listBookings: async () => [],
  })
  assert.ok(r.attempted && !r.ok)
  if (r.attempted && !r.ok) {
    assert.equal(r.incident?.kind, "hotel_mismatch")
    assert.equal(r.incident?.supplierBookingRef, "987654")
  }
})

test("réservation myGo confirmée pour le bon hôtel → aucun incident", async () => {
  const r = await confirmWith({
    createBooking: async () => confirmation(123),
    listBookings: async () => [],
  })
  assert.ok(r.attempted && r.ok)
  assert.equal("incident" in r, false)
})

// ─── recordSupplierIncident (PostgreSQL réel) ─────────────────────────────

test("codes d'audit et type d'entité compatibles avec varchar(32)", () => {
  for (const action of Object.values(SUPPLIER_INCIDENT_ACTIONS)) {
    assert.ok(action.length <= 32, `${action} : ${action.length} caractères`)
  }
  assert.ok(SUPPLIER_INCIDENT_ENTITY_TYPE.length <= 32)
})

async function newAgency() {
  const s = randomUUID().slice(0, 8)
  const [a] = await withSystemContext((tx) =>
    tx
      .insert(agencies)
      .values({ name: `SIT ${s}`, agencyType: "ota", slug: `sit-${s}` })
      .returning({ id: agencies.id }),
  )
  return a!.id
}

test("live : la trace survit au ROLLBACK de la transaction de réservation (ligne témoin annulée, trace conservée)", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const agencyId = await newAgency()
  const ref = `MYGO-${randomUUID().slice(0, 8)}`
  const witness = `WITNESS-${randomUUID().slice(0, 8)}`
  await assert.rejects(
    withSystemContext(async (outer) => {
      // Écriture DANS la transaction de réservation : doit disparaître.
      await outer.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: witness,
        action: "reservation.test_witness",
      })
      const ok = await recordSupplierIncident({
        agencyId,
        kind: "compensation_failed",
        supplier: "mygo",
        flow: "hotel_b2c",
        step: "transaction_failed",
        supplierBookingRef: ref,
        hotelId: 123,
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        error: new Error("cancel refusé"),
      })
      assert.equal(ok, true)
      throw new Error("transaction de réservation annulée")
    }),
    /annulée/,
  )
  const witnessRows = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, witness)),
  )
  assert.equal(
    witnessRows.length,
    0,
    "la transaction englobante a bien été annulée",
  )
  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, SUPPLIER_INCIDENT_ENTITY_TYPE),
          eq(auditEvents.entityId, ref),
        ),
      ),
  )
  assert.equal(rows.length, 1, "la trace d'incident a survécu au rollback")
  assert.equal(rows[0]!.action, "supplier.compensation_failed")
  assert.equal(rows[0]!.agencyId, agencyId)
  const diff = rows[0]!.diff as Record<string, unknown>
  assert.equal(diff.supplierBookingRef, ref)
  assert.equal(diff.step, "transaction_failed")
  assert.equal(diff.error, "cancel refusé")
})

for (const kind of [
  "booking_ambiguous",
  "compensation_failed",
  "hotel_mismatch",
] as const) {
  test(`live : cas ${kind} persisté avec son code d'audit après rollback`, async (t) => {
    if (!dbAvailable) return void t.skip("Postgres local indisponible.")
    const agencyId = await newAgency()
    const ref =
      kind === "booking_ambiguous" ? null : `REF-${randomUUID().slice(0, 8)}`
    await assert.rejects(
      withSystemContext(async () => {
        await recordSupplierIncident({
          agencyId,
          kind,
          supplier: "mygo",
          flow: "hotel_b2b",
          step: "provider_confirmation",
          supplierBookingRef: ref,
          hotelId: 789,
          checkIn: "2026-12-26",
        })
        throw new Error("rollback")
      }),
    )
    const rows = await withSystemContext((tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.agencyId, agencyId),
            eq(auditEvents.action, SUPPLIER_INCIDENT_ACTIONS[kind]),
          ),
        ),
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.entityType, SUPPLIER_INCIDENT_ENTITY_TYPE)
    if (ref) assert.equal(rows[0]!.entityId, ref)
  })
}

test("live : référence inconnue → identifiant de trace explicite, jamais vide", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const agencyId = await newAgency()
  await recordSupplierIncident({
    agencyId,
    kind: "booking_ambiguous",
    supplier: "mygo",
    flow: "hotel_b2b",
    step: "provider_confirmation",
    supplierBookingRef: null,
    hotelId: 456,
    checkIn: "2026-12-24",
  })
  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.agencyId, agencyId),
          eq(auditEvents.action, "supplier.booking_ambiguous"),
        ),
      ),
  )
  assert.equal(rows.length, 1)
  assert.match(rows[0]!.entityId, /^mygo:unknown:456:2026-12-24:/)
})

test("live : échec d'écriture (agence inexistante) → false, jamais d'exception", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const ok = await recordSupplierIncident({
    agencyId: randomUUID(),
    kind: "compensation_failed",
    supplier: "hotel_monde",
    flow: "hotel_monde_b2c",
    step: "transaction_failed",
    supplierBookingRef: "WH-X",
  })
  assert.equal(ok, false)
  // Identifiant d'agence invalide (erreur du pilote) : toujours false, jamais d'exception.
  const ok2 = await recordSupplierIncident({
    agencyId: "pas-un-uuid",
    kind: "hotel_mismatch",
    supplier: "mygo",
    flow: "hotel_b2c",
    step: "provider_confirmation",
    supplierBookingRef: "X",
  })
  assert.equal(ok2, false)
})

// ─── Câblage ──────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(p, "utf8")
const count = (s: string, needle: string) => s.split(needle).length - 1

test("câblage hôtels Tunisie B2C : 4 annulations de rattrapage tracées + incident de confirmation", () => {
  const src = read("lib/booking/guest-actions.ts")
  for (const step of [
    "price_drift",
    "card_payment_failed",
    "idempotency_conflict",
    "transaction_failed",
  ]) {
    assert.equal(
      count(src, `traceCompensationFailure("${step}", cancelErr)`),
      1,
      step,
    )
  }
  assert.match(src, /if \(providerConfirmation\.incident\) \{/)
  assert.match(src, /flow: "hotel_b2c"/)
})

test("câblage hôtels Tunisie B2B : 3 annulations de rattrapage tracées + incident de confirmation", () => {
  const src = read("lib/booking/actions.ts")
  for (const step of [
    "price_drift",
    "idempotency_conflict",
    "transaction_failed",
  ]) {
    assert.equal(
      count(src, `traceCompensationFailure("${step}", cancelErr)`),
      1,
      step,
    )
  }
  assert.match(src, /if \(providerConfirmation\.incident\) \{/)
  assert.match(src, /flow: "hotel_b2b"/)
})

test("câblage Hôtel Monde : annulation de rattrapage en échec tracée", () => {
  const src = read("lib/hotels-monde/guest-booking-actions.ts")
  assert.match(
    src,
    /catch \(cancelErr\) \{[\s\S]{0,400}?recordSupplierIncident\(\{[\s\S]{0,200}?kind: "compensation_failed"/,
  )
})

test("aucune annulation de rattrapage n'avale encore son erreur sans trace", () => {
  for (const p of [
    "lib/booking/guest-actions.ts",
    "lib/booking/actions.ts",
    "lib/hotels-monde/guest-booking-actions.ts",
  ]) {
    const src = read(p)
    const bare = src.match(
      /(cancelBooking|cancelWorldHotel)\(\{[\s\S]{0,200}?\}\)\s*\}\s*catch\s*\{/g,
    )
    assert.equal(bare, null, `${p} : catch sans trace après une annulation`)
  }
})

test("une réservation réussie ne trace jamais : chaque écriture est dans un catch d'annulation ou sous providerConfirmation.incident", () => {
  for (const p of [
    "lib/booking/guest-actions.ts",
    "lib/booking/actions.ts",
    "lib/hotels-monde/guest-booking-actions.ts",
  ]) {
    const src = read(p)
    const re = /traceCompensationFailure\("|recordSupplierIncident\(\{/g
    let m: RegExpExecArray | null
    let checked = 0
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 400), m.index)
      // Définition de la fonction locale : pas un point d'appel.
      if (/const traceCompensationFailure = \([^)]*\) =>\s*$/.test(before))
        continue
      assert.ok(
        /catch \(cancelErr(: unknown)?\) \{[\s\S]*$/.test(before) ||
          /if \(providerConfirmation\.incident\) \{\s*(await\s+)?$/.test(
            before,
          ),
        `${p} : écriture de trace hors d'un cas d'échec (index ${m.index})`,
      )
      checked++
    }
    assert.ok(checked > 0, `${p} : aucun point de trace trouvé`)
  }
})

test("l'erreur initiale n'est jamais masquée : message client conservé, erreur d'annulation relancée après la trace", () => {
  const guest = read("lib/booking/guest-actions.ts")
  // Hold carte : la trace (qui ne lève jamais) précède la relance de l'erreur d'origine.
  assert.match(
    guest,
    /await traceCompensationFailure\("card_payment_failed", cancelErr\)\s*throw cancelErr/,
  )
  // Échec de transaction : le message « potentiellement toujours active » est posé AVANT la trace.
  for (const p of ["lib/booking/guest-actions.ts", "lib/booking/actions.ts"]) {
    assert.match(
      read(p),
      /compensationNote = ` Réservation fournisseur \$\{myGoBooking\.bookingId\} potentiellement toujours active[^`]*`\s*await traceCompensationFailure\("transaction_failed", cancelErr\)/,
      p,
    )
  }
  assert.match(
    read("lib/hotels-monde/guest-booking-actions.ts"),
    /compensationNote = ` Réservation fournisseur \$\{bookResult\.confirmationNumber\} potentiellement toujours active[^`]*`[\s\S]{0,120}?await recordSupplierIncident\(/,
  )
  // La fonction de trace attrape toute erreur d'écriture (aucun throw hors du try).
  const helper = read("lib/booking/supplier-incident.ts")
  assert.match(
    helper,
    /try \{\s*await withSystemContext[\s\S]*?return true\s*\} catch \(err\) \{[\s\S]*?return false/,
  )
  assert.doesNotMatch(helper, /\bthrow\b/)
})
