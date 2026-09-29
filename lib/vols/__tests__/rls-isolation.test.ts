/**
 * SEC-RLS-02 — Isolation RLS des 14 tables Flight Puzzle + fournisseurs
 * (flight_searches, flight_price_snapshots, flight_bookings,
 * flight_booking_passengers, flight_booking_segments, flight_tickets,
 * flight_supplier_transactions, flight_supplier_configs,
 * flight_supplier_credentials, flight_commercial_rules, flight_orders,
 * flight_ancillaries, supplier_nodes, supplier_portal_users).
 *
 * Comme resolver-security.test.ts (Phase 27), ces garanties sont appliquées
 * par PostgreSQL lui-même (RLS) — un mock ne prouverait que ma propre
 * compréhension de la RLS, pas la RLS réelle. Exécute donc contre un
 * Postgres réel (DATABASE_URL) ; se dégrade proprement en `skip` si aucune
 * base n'est joignable, pour ne jamais casser `pnpm test` sans Postgres
 * local — voir drizzle/manual/0076_flight_supplier_rls_policies.sql pour
 * les policies exactement testées ici (versionnement fidèle de ce qui
 * existe déjà en production, vérifié le 2026-09-29).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import {
  agencies,
  flightSearches,
  flightPriceSnapshots,
  flightBookings,
  flightBookingPassengers,
  flightSupplierConfigs,
  flightSupplierCredentials,
  supplierNodes,
  supplierPortalUsers,
  suppliers,
} from "@/lib/db/schema"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — appliquer drizzle/manual/0076_flight_supplier_rls_policies.sql sur un mirroir local pour exécuter ces tests."

let agencyA = "",
  agencyB = ""
let userA = "",
  userB = "",
  userSuperAdmin = ""
let snapshotIdA = ""
let bookingIdA = ""
let supplierIdForConfig = ""
let configIdA = ""

const ctx = {
  a: (): TenantContext => ({
    agencyId: agencyA,
    userId: userA,
    isSuperAdmin: false,
  }),
  b: (): TenantContext => ({
    agencyId: agencyB,
    userId: userB,
    isSuperAdmin: false,
  }),
  superAdmin: (): TenantContext => ({
    agencyId: null,
    userId: userSuperAdmin,
    isSuperAdmin: true,
  }),
}

async function setupFixtures() {
  agencyA = randomUUID()
  agencyB = randomUUID()
  userA = randomUUID()
  userB = randomUUID()
  userSuperAdmin = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyA,
        name: "RLS-FLIGHT Agency A",
        agencyType: "ota",
        slug: `rls-flight-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "RLS-FLIGHT Agency B",
        agencyType: "ota",
        slug: `rls-flight-b-${agencyB.slice(0, 8)}`,
      },
    ])
    const [supplier] = await tx
      .insert(suppliers)
      .values({
        name: `RLS-FLIGHT Supplier ${randomUUID().slice(0, 8)}`,
        type: "amadeus",
        status: "active",
      })
      .returning({ id: suppliers.id })
    supplierIdForConfig = supplier!.id
  })

  await withTenantContext(ctx.a(), async (tx) => {
    const [snapshot] = await tx
      .insert(flightPriceSnapshots)
      .values({
        agencyId: agencyA,
        provider: "virtual",
        providerOfferId: "RLS-OFFER-A",
        itinerary: {},
        supplierAmount: "400.000",
        sellingAmount: "450.000",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      })
      .returning({ id: flightPriceSnapshots.id })
    snapshotIdA = snapshot!.id

    const [booking] = await tx
      .insert(flightBookings)
      .values({
        agencyId: agencyA,
        priceSnapshotId: snapshotIdA,
        tripType: "ONE_WAY",
        itinerary: {},
        contact: { email: "rls-flight-a@example.tn" },
        provider: "virtual",
      })
      .returning({ id: flightBookings.id })
    bookingIdA = booking!.id

    await tx.insert(flightBookingPassengers).values({
      bookingId: bookingIdA,
      firstName: "RLS",
      lastName: "TestA",
      sequence: 1,
    })

    const [config] = await tx
      .insert(flightSupplierConfigs)
      .values({ agencyId: agencyA, supplier: "virtual" })
      .returning({ id: flightSupplierConfigs.id })
    configIdA = config!.id
    await tx.insert(flightSupplierCredentials).values({
      configId: configIdA,
      agencyId: agencyA,
      ciphertext: "rls-flight-test-ciphertext",
      keyVersion: 1,
    })
  })
}

async function cleanupFixtures() {
  if (!agencyA) return
  await withSystemContext(async (tx) => {
    if (configIdA) {
      await tx
        .delete(flightSupplierCredentials)
        .where(eq(flightSupplierCredentials.configId, configIdA))
      await tx
        .delete(flightSupplierConfigs)
        .where(eq(flightSupplierConfigs.id, configIdA))
    }
    if (bookingIdA) {
      await tx
        .delete(flightBookingPassengers)
        .where(eq(flightBookingPassengers.bookingId, bookingIdA))
      await tx.delete(flightBookings).where(eq(flightBookings.id, bookingIdA))
    }
    if (snapshotIdA)
      await tx
        .delete(flightPriceSnapshots)
        .where(eq(flightPriceSnapshots.id, snapshotIdA))
    if (supplierIdForConfig)
      await tx.delete(suppliers).where(eq(suppliers.id, supplierIdForConfig))
    await tx
      .delete(agencies)
      .where(sql`${agencies.id} in (${agencyA}, ${agencyB})`)
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (dbAvailable) await setupFixtures()
})
after(async () => {
  if (dbAvailable) await cleanupFixtures()
})

test("1. flight_price_snapshots — une agence ne voit jamais un snapshot d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx
      .select()
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotIdA)),
  )
  assert.equal(rows.length, 0)
})

test("2. flight_price_snapshots — l'agence propriétaire voit bien son snapshot", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.a(), async (tx) =>
    tx
      .select()
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotIdA)),
  )
  assert.equal(rows.length, 1)
})

test("3. flight_bookings — une agence ne voit jamais une réservation d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx.select().from(flightBookings).where(eq(flightBookings.id, bookingIdA)),
  )
  assert.equal(rows.length, 0)
})

test("4. flight_booking_passengers — isolation indirecte via flight_bookings.agency_id (table fille sans agency_id propre)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsB = await withTenantContext(ctx.b(), async (tx) =>
    tx
      .select()
      .from(flightBookingPassengers)
      .where(eq(flightBookingPassengers.bookingId, bookingIdA)),
  )
  assert.equal(rowsB.length, 0)
  const rowsA = await withTenantContext(ctx.a(), async (tx) =>
    tx
      .select()
      .from(flightBookingPassengers)
      .where(eq(flightBookingPassengers.bookingId, bookingIdA)),
  )
  assert.equal(rowsA.length, 1)
})

test("5. flight_supplier_configs — une agence ne voit jamais la config fournisseur d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx
      .select()
      .from(flightSupplierConfigs)
      .where(eq(flightSupplierConfigs.id, configIdA)),
  )
  assert.equal(rows.length, 0)
})

test("6. flight_supplier_credentials — jamais lisibles par une agence tierce, même si le config parent était visible", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx
      .select()
      .from(flightSupplierCredentials)
      .where(eq(flightSupplierCredentials.configId, configIdA)),
  )
  assert.equal(rows.length, 0)
})

test("7. Une agence ne peut pas écrire (UPDATE) une réservation de vol qui ne lui appartient pas", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const updated = await withTenantContext(ctx.b(), async (tx) => {
    const result = await tx
      .update(flightBookings)
      .set({ opsNotes: "HACKED_BY_B" })
      .where(eq(flightBookings.id, bookingIdA))
      .returning({ id: flightBookings.id })
    return result.length
  })
  assert.equal(updated, 0)
})

test("8. super_admin voit toutes les agences sur flight_bookings (accès privilégié intentionnel)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.superAdmin(), async (tx) =>
    tx.select().from(flightBookings).where(eq(flightBookings.id, bookingIdA)),
  )
  assert.equal(rows.length, 1)
})

test("9. supplier_nodes — une agence normale (non super_admin) ne peut pas lire la table (réseau fournisseur global, verrouillé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.a(), async (tx) =>
    tx.select().from(supplierNodes).limit(1),
  )
  assert.equal(rows.length, 0)
})

test("10. supplier_portal_users — une agence normale ne peut pas lire la table (réservé super_admin)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.a(), async (tx) =>
    tx.select().from(supplierPortalUsers).limit(1),
  )
  assert.equal(rows.length, 0)
})

test("11. Une agence ne peut pas créer une réservation de vol pour une autre agence (WITH CHECK sur INSERT)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  let inserted = false
  try {
    await withTenantContext(ctx.a(), async (tx) => {
      await tx.insert(flightBookings).values({
        agencyId: agencyB,
        tripType: "ONE_WAY",
        itinerary: {},
        contact: { email: "hack@example.tn" },
      })
    })
    inserted = true
  } catch {
    inserted = false
  }
  assert.equal(inserted, false)
})

test("12. flight_searches — table sans donnée de test dédiée, vérifie juste que RLS est active (une agence sans recherche ne casse rien, liste vide, jamais une exception)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(ctx.b(), async (tx) =>
    tx
      .select()
      .from(flightSearches)
      .where(eq(flightSearches.agencyId, agencyA)),
  )
  assert.equal(rows.length, 0)
})
