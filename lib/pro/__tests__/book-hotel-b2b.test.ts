/**
 * Tests unitaires — Cœur transactionnel du tunnel de réservation B2B
 * (`runB2BHotelReservation`).
 *
 * Objectif : prouver l'atomicité totale du flux :
 *   1. résolution / création du client,
 *   2. génération de la référence publique séquentielle,
 *   3. insertion réservation + extension hôtel,
 *   4. **débit pessimiste** (`FOR UPDATE`) du compte de dépôt,
 *   5. journal d'audit.
 *
 * Si le débit échoue (solde insuffisant / agence inconnue), la fonction
 * doit **throw** une `B2BDebitFailure` → la transaction Drizzle englobante
 * est annulée et la réservation n'est jamais persistée.
 *
 * Stratégie : on injecte une fausse transaction Drizzle (`tx`) qui résout
 * chaque opération selon la table ciblée et journalise l'ordre des appels.
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
  runB2BHotelReservation,
  hotelSlugToInt,
  B2BDebitFailure,
  type BookHotelB2BParsed,
} from "../booking-actions"
import {
  agencies,
  auditEvents,
  customers,
  partnerCreditMovements,
  reservations,
  reservationHotel,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Mock de transaction Drizzle                                                */
/* -------------------------------------------------------------------------- */

type Op = { op: string; table?: string; data?: Record<string, unknown> }

type MockTxOptions = {
  existingCustomer: boolean
  /** Référence max existante pour l'agence (null = aucune → 000001). */
  maxRef: string | null
  agencyExists: boolean
  /** Solde du compte de dépôt renvoyé par le SELECT … FOR UPDATE. */
  currentBalance: string | null
}

function nameOf(table: unknown): string {
  if (table === customers) return "customers"
  if (table === reservations) return "reservations"
  if (table === reservationHotel) return "reservationHotel"
  if (table === agencies) return "agencies"
  if (table === partnerCreditMovements) return "partnerCreditMovements"
  if (table === auditEvents) return "auditEvents"
  return "unknown"
}

function makeMockTx(opts: MockTxOptions) {
  const journal: Op[] = []

  function makeChain(kind: "select" | "insert" | "update", table0?: unknown) {
    const state: {
      kind: "select" | "insert" | "update"
      table: unknown
      values?: Record<string, unknown>
      set?: Record<string, unknown>
    } = { kind, table: table0 }

    function resolveAwait(): unknown {
      if (state.kind === "select") {
        if (state.table === customers) {
          journal.push({ op: "select", table: "customers" })
          return opts.existingCustomer ? [{ id: "cust-existing" }] : []
        }
        if (state.table === reservations) {
          journal.push({ op: "select.maxRef", table: "reservations" })
          return [{ maxRef: opts.maxRef }]
        }
        return []
      }
      if (state.kind === "insert") {
        journal.push({
          op: "insert.await",
          table: nameOf(state.table),
          data: state.values,
        })
      } else {
        journal.push({
          op: "update.await",
          table: nameOf(state.table),
          data: state.set,
        })
      }
      return undefined
    }

    const chain = {
      from(t: unknown) {
        state.table = t
        return chain
      },
      leftJoin() {
        return chain
      },
      where() {
        return chain
      },
      limit() {
        return Promise.resolve(resolveAwait())
      },
      values(v: Record<string, unknown>) {
        state.values = v
        return chain
      },
      set(v: Record<string, unknown>) {
        state.set = v
        return chain
      },
      for(strength: string) {
        journal.push({
          op: "select.for",
          table: nameOf(state.table),
          data: { strength },
        })
        if (state.table === agencies) {
          return Promise.resolve(
            opts.agencyExists
              ? [{ id: "agency-uuid", depositBalance: opts.currentBalance }]
              : [],
          )
        }
        return Promise.resolve([])
      },
      returning() {
        journal.push({
          op: "insert.returning",
          table: nameOf(state.table),
          data: state.values,
        })
        if (state.table === customers) return Promise.resolve([{ id: "cust-new" }])
        if (state.table === reservations)
          return Promise.resolve([{ id: "resa-uuid" }])
        if (state.table === partnerCreditMovements)
          return Promise.resolve([{ id: "mov-uuid" }])
        return Promise.resolve([{ id: "generic-uuid" }])
      },
      then(
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(resolveAwait()).then(resolve, reject)
      },
    }
    return chain
  }

  const tx = {
    select: () => makeChain("select"),
    insert: (t: unknown) => makeChain("insert", t),
    update: (t: unknown) => makeChain("update", t),
  }

  return { tx, journal }
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeInput(
  overrides: Partial<BookHotelB2BParsed> = {},
): BookHotelB2BParsed {
  return {
    hotel: {
      id: "carthage-thalasso",
      name: "Carthage Thalasso Resort",
      cityName: "Gammarth",
    },
    stay: {
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
      adults: 2,
      children: 0,
      childrenAges: [],
    },
    offers: [
      {
        id: "standard-bb",
        qty: 1,
        unitPriceTnd: 1051.566,
        boardCode: "bb",
        boardName: "Petit-déjeuner",
      },
    ],
    traveler: {
      civility: "M",
      firstName: "Ahmed",
      lastName: "Ben Salah",
      email: "ahmed@example.tn",
      phone: "+216 98 123 456",
      civicIdType: "cin",
      civicId: "12345678",
      birthDate: "",
      nationality: "",
    },
    totalTnd: 1051.566,
    ...overrides,
  }
}

const expectedRef = `TG-${new Date().getFullYear()}-000001`

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

test("hotelSlugToInt : entier positif, déterministe, ≤ int32", () => {
  const a = hotelSlugToInt("carthage-thalasso")
  const b = hotelSlugToInt("carthage-thalasso")
  assert.equal(a, b, "doit être déterministe")
  assert.ok(a > 0, "doit être strictement positif")
  assert.ok(a < 2147483647, "doit tenir dans un integer Postgres")
  assert.notEqual(
    hotelSlugToInt("carthage-thalasso"),
    hotelSlugToInt("hotel-concorde"),
    "deux slugs distincts → ids distincts",
  )
})

test("runB2BHotelReservation : succès — réservation insérée PUIS débitée (atomique)", async () => {
  const { tx, journal } = makeMockTx({
    existingCustomer: false,
    maxRef: null,
    agencyExists: true,
    currentBalance: "10000.000",
  })

  const result = await runB2BHotelReservation(tx as never, {
    agencyId: "agency-uuid",
    userId: "user-uuid",
    input: makeInput(),
  })

  assert.equal(result.reservationId, "resa-uuid")
  assert.equal(result.publicRef, expectedRef)
  assert.equal(result.balanceAfter, "8948.434") // 10000 - 1051.566

  const ops = journal.map((j) => `${j.op}:${j.table ?? ""}`)

  // La réservation est insérée AVANT le débit (même transaction → atomique).
  const resaIdx = ops.indexOf("insert.returning:reservations")
  const lockIdx = ops.indexOf("select.for:agencies")
  const movIdx = ops.indexOf("insert.returning:partnerCreditMovements")
  assert.ok(resaIdx >= 0, "la réservation doit être insérée")
  assert.ok(lockIdx > resaIdx, "le verrou FOR UPDATE doit suivre l'insertion")
  assert.ok(movIdx > lockIdx, "le mouvement de débit doit suivre le verrou")

  // Le verrou pessimiste a bien la force "update".
  const lock = journal.find((j) => j.op === "select.for")
  assert.equal(lock?.data?.strength, "update")

  // createdByUserId injecté côté serveur (jamais le client).
  const resaInsert = journal.find(
    (j) => j.op === "insert.returning" && j.table === "reservations",
  )
  assert.equal(resaInsert?.data?.createdByUserId, "user-uuid")

  // Mouvement de débit négatif.
  const movInsert = journal.find(
    (j) => j.op === "insert.returning" && j.table === "partnerCreditMovements",
  )
  assert.equal(movInsert?.data?.amount, "-1051.566")
  assert.equal(movInsert?.data?.balanceAfter, "8948.434")

  // hotel_id dérivé du slug (entier déterministe).
  const hotelInsert = journal.find(
    (j) => j.op === "insert.await" && j.table === "reservationHotel",
  )
  assert.equal(hotelInsert?.data?.hotelId, hotelSlugToInt("carthage-thalasso"))

  // Audit écrit dans la transaction.
  assert.ok(
    journal.some((j) => j.op === "insert.await" && j.table === "auditEvents"),
    "un événement d'audit doit être journalisé",
  )
})

test("runB2BHotelReservation : client existant réutilisé (pas de doublon)", async () => {
  const { tx, journal } = makeMockTx({
    existingCustomer: true,
    maxRef: null,
    agencyExists: true,
    currentBalance: "10000.000",
  })

  await runB2BHotelReservation(tx as never, {
    agencyId: "agency-uuid",
    userId: "user-uuid",
    input: makeInput(),
  })

  // Aucun INSERT customers ne doit avoir lieu (client retrouvé par email).
  assert.equal(
    journal.find((j) => j.op === "insert.returning" && j.table === "customers"),
    undefined,
    "le client existant ne doit pas être recréé",
  )
})

test("runB2BHotelReservation : référence séquentielle incrémentée", async () => {
  const year = new Date().getFullYear()
  const { tx } = makeMockTx({
    existingCustomer: false,
    maxRef: `TG-${year}-000041`,
    agencyExists: true,
    currentBalance: "10000.000",
  })

  const result = await runB2BHotelReservation(tx as never, {
    agencyId: "agency-uuid",
    userId: "user-uuid",
    input: makeInput(),
  })

  assert.equal(result.publicRef, `TG-${year}-000042`)
})

test("runB2BHotelReservation : solde insuffisant → throw B2BDebitFailure (ROLLBACK)", async () => {
  const { tx, journal } = makeMockTx({
    existingCustomer: false,
    maxRef: null,
    agencyExists: true,
    currentBalance: "500.000", // < total 1051.566
  })

  await assert.rejects(
    () =>
      runB2BHotelReservation(tx as never, {
        agencyId: "agency-uuid",
        userId: "user-uuid",
        input: makeInput(),
      }),
    (err: unknown) => {
      assert.ok(err instanceof B2BDebitFailure)
      assert.equal((err as B2BDebitFailure).code, "INSUFFICIENT_FUNDS")
      return true
    },
  )

  // Le throw déclenche le ROLLBACK : aucun mouvement de débit, aucune maj solde.
  assert.equal(
    journal.find(
      (j) =>
        j.op === "insert.returning" && j.table === "partnerCreditMovements",
    ),
    undefined,
    "aucun débit ne doit être inséré quand le solde est insuffisant",
  )
  assert.equal(
    journal.find((j) => j.op === "update.await" && j.table === "agencies"),
    undefined,
    "le solde ne doit pas être mis à jour",
  )
})

test("runB2BHotelReservation : agence introuvable → throw B2BDebitFailure", async () => {
  const { tx } = makeMockTx({
    existingCustomer: false,
    maxRef: null,
    agencyExists: false,
    currentBalance: null,
  })

  await assert.rejects(
    () =>
      runB2BHotelReservation(tx as never, {
        agencyId: "agency-inexistante",
        userId: "user-uuid",
        input: makeInput(),
      }),
    (err: unknown) => {
      assert.ok(err instanceof B2BDebitFailure)
      assert.equal((err as B2BDebitFailure).code, "AGENCY_NOT_FOUND")
      return true
    },
  )
})
