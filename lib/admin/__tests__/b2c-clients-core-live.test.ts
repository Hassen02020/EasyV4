/**
 * B2C-CLIENTS-SEARCH-01 (G-54) — preuve live (Postgres réel, app_runtime,
 * RLS forcée). Se dégrade en `skip` sans base locale.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, customers } from "@/lib/db/schema"
import {
  B2C_CLIENTS_PAGE_SIZE,
  b2cClientStatsCore,
  likePattern,
  listB2cClientsCore,
} from "../b2c-clients-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
let agencyId = ""
let otherAgencyId = ""
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."
const asAgency = <T>(fn: Parameters<typeof withTenantContext<T>>[1]) =>
  withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, fn)

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  otherAgencyId = randomUUID()
  await withSystemContext(async (tx) => {
    for (const id of [agencyId, otherAgencyId]) {
      await tx.insert(agencies).values({
        id,
        slug: `b2c-search-${id.slice(0, 8)}`,
        name: "B2C-CLIENTS-SEARCH-01 fixture",
        agencyType: "ota",
      })
    }
    // 105 clients anonymes (plus qu'une page) + 1 client cherché.
    await tx.insert(customers).values(
      Array.from({ length: 105 }, (_, i) => ({
        agencyId,
        firstName: `Client${i}`,
        lastName: "Test",
        email: `client${i}@example.test`,
        createdAt: new Date("2026-01-15T10:00:00Z"),
      })),
    )
    await tx.insert(customers).values({
      agencyId,
      firstName: "Amira",
      lastName: "Ben Salah",
      email: "amira.bs@example.test",
      phone: "+216 98 140 514",
      createdAt: new Date("2026-10-20T10:00:00Z"),
    })
    // Même nom dans une autre agence : ne doit jamais sortir.
    await tx.insert(customers).values({
      agencyId: otherAgencyId,
      firstName: "Amira",
      lastName: "Autre",
      email: "amira.autre@example.test",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, otherAgencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, otherAgencyId))
  })
})

test("statistiques sur toute la base (106), pas sur la page de 100", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const stats = await asAgency((tx) =>
    b2cClientStatsCore(tx, {
      agencyId,
      now: new Date("2026-10-30T12:00:00Z"),
    }),
  )
  assert.deepEqual(stats, { total: 106, withReservations: 0, newThisMonth: 1 })
  const page = await asAgency((tx) =>
    listB2cClientsCore(tx, { agencyId, q: "" }),
  )
  assert.equal(page.length, B2C_CLIENTS_PAGE_SIZE)
})

test("recherche : prénom, nom complet, email, téléphone (chiffres), isolée par agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  for (const q of ["amira", "Amira Ben", "AMIRA.BS@", "98140514", "98 140"]) {
    const rows = await asAgency((tx) => listB2cClientsCore(tx, { agencyId, q }))
    assert.deepEqual(
      rows.map((r) => r.email),
      ["amira.bs@example.test"],
      `recherche « ${q} »`,
    )
  }
})

test("recherche : % et _ traités comme du texte, pas comme des jokers", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  assert.equal(likePattern("50%_x"), "%50\\%\\_x%")
  const rows = await asAgency((tx) =>
    listB2cClientsCore(tx, { agencyId, q: "%" }),
  )
  assert.equal(rows.length, 0)
})
