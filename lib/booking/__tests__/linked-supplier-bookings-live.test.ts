/**
 * MYGO-RECONCILE-GUARD-01 — preuve sur PostgreSQL réel : un identifiant myGo
 * rattaché à une réservation (quelle que soit l'agence) est détecté.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservationHotel,
  reservations,
} from "@/lib/db/schema"
import { findLinkedMyGoBookingIds } from "../linked-supplier-bookings"

let dbAvailable = false
before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

test("live : identifiants rattachés détectés, inconnus ignorés, entrée vide sans requête", async (t) => {
  if (!dbAvailable) return void t.skip("Postgres local indisponible.")
  const s = randomUUID().slice(0, 8)
  const linkedId = 900_000_000 + Math.floor(Math.random() * 99_999_999)
  const freeId = linkedId + 1
  await withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `RG ${s}`, agencyType: "ota", slug: `rg-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "RG", lastName: s })
      .returning({ id: customers.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `RG-${s}`,
        customerId: customer!.id,
        module: "hotel",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "100.00",
        tndAmount: "100.00",
      })
      .returning({ id: reservations.id })
    await tx.insert(reservationHotel).values({
      reservationId: res!.id,
      agencyId: agency!.id,
      providerBookingId: String(linkedId),
      hotelId: 1,
      hotelName: "RG",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      nights: 3,
      adults: 2,
    } as typeof reservationHotel.$inferInsert)
  })
  const found = await findLinkedMyGoBookingIds([linkedId, freeId])
  assert.deepEqual([...found], [linkedId])
  assert.equal((await findLinkedMyGoBookingIds([])).size, 0)
  assert.equal((await findLinkedMyGoBookingIds([NaN])).size, 0)
})

test("la réconciliation des deux appelants passe par findLinkedMyGoBookingIds", async () => {
  const { readFileSync } = await import("node:fs")
  for (const f of [
    "lib/booking/actions.ts",
    "lib/hotel-suppliers/mygo/driver.ts",
  ]) {
    assert.match(
      readFileSync(f, "utf8"),
      /findLinkedMyGoBookingIds|findLinkedBookingIds/,
      f,
    )
  }
})
