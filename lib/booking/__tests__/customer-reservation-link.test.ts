/**
 * PHASE "CUSTOMER RESERVATION LINK" — preuve live (Postgres réel) que
 * `resolveOrCreateLinkedCustomer()` (lib/booking/customer-identity.ts, la
 * logique find-or-create partagée par le guest checkout Hôtel) respecte
 * exactement les règles de sécurité de la mission :
 *   - guest inchangé (`linkedAuthUserId: null` → `authUserId` jamais posé)
 *   - nouvelle ligne + client connecté → `authUserId` posé
 *   - ligne EXISTANTE + client connecté → `authUserId` posé UNIQUEMENT si
 *     elle n'en avait encore aucun
 *   - ligne EXISTANTE avec un `authUserId` DÉJÀ posé → jamais écrasé (
 *     "réservation existante non modifiée")
 *   - isolation tenant : même email, agences différentes → deux lignes
 *     `customers` distinctes, jamais de fuite cross-agence
 *
 * Se dégrade en `skip` sans Postgres local (même convention que
 * lib/hotel-suppliers/tenant/__tests__/live-resolution.test.ts).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers } from "@/lib/db/schema"
import { resolveOrCreateLinkedCustomer, type LinkableTraveler } from "../customer-identity"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyA = ""
let agencyB = ""

function traveler(email: string): LinkableTraveler {
  return {
    civility: "M",
    firstName: "Test",
    lastName: "Client",
    email,
    phone: "+21600000000",
  }
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `crl-a-${agencyA}`, name: "CRL Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `crl-b-${agencyB}`, name: "CRL Test Agency B", agencyType: "ota" },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("resolveOrCreateLinkedCustomer : visiteur non connecté (linkedAuthUserId=null) → nouvelle ligne, authUserId jamais posé (guest inchangé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `guest-${randomUUID()}@example.com`
  const customerId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyA, traveler: traveler(email), linkedAuthUserId: null }),
  )
  const [row] = await withSystemContext((tx) =>
    tx.select({ authUserId: customers.authUserId }).from(customers).where(eq(customers.id, customerId)),
  )
  assert.equal(row!.authUserId, null)
})

test("resolveOrCreateLinkedCustomer : client connecté (email de session = email voyageur) + nouvelle ligne → authUserId posé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `authed-${randomUUID()}@example.com`
  const authUserId = randomUUID()
  const customerId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyA, traveler: traveler(email), linkedAuthUserId: authUserId }),
  )
  const [row] = await withSystemContext((tx) =>
    tx.select({ authUserId: customers.authUserId }).from(customers).where(eq(customers.id, customerId)),
  )
  assert.equal(row!.authUserId, authUserId)
})

test("resolveOrCreateLinkedCustomer : ligne EXISTANTE (authUserId encore null) + client connecté → authUserId posé sur la ligne réutilisée, pas de nouvelle ligne", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `existing-${randomUUID()}@example.com`
  const authUserId = randomUUID()

  const firstId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyA, traveler: traveler(email), linkedAuthUserId: null }),
  )
  const secondId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyA, traveler: traveler(email), linkedAuthUserId: authUserId }),
  )

  assert.equal(secondId, firstId, "même ligne customer réutilisée, jamais un doublon")
  const [row] = await withSystemContext((tx) =>
    tx.select({ authUserId: customers.authUserId }).from(customers).where(eq(customers.id, firstId)),
  )
  assert.equal(row!.authUserId, authUserId)
})

test("resolveOrCreateLinkedCustomer : ligne EXISTANTE avec authUserId DÉJÀ posé → jamais écrasé par un rattachement ultérieur différent (réservation existante non modifiée)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `already-linked-${randomUUID()}@example.com`
  const firstAuthUserId = randomUUID()
  const secondAuthUserId = randomUUID()

  const firstId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, {
      agencyId: agencyA,
      traveler: traveler(email),
      linkedAuthUserId: firstAuthUserId,
    }),
  )
  const secondId = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, {
      agencyId: agencyA,
      traveler: traveler(email),
      linkedAuthUserId: secondAuthUserId,
    }),
  )

  assert.equal(secondId, firstId)
  const [row] = await withSystemContext((tx) =>
    tx.select({ authUserId: customers.authUserId }).from(customers).where(eq(customers.id, firstId)),
  )
  assert.equal(row!.authUserId, firstAuthUserId, "la valeur déjà posée ne doit jamais être remplacée")
})

test("resolveOrCreateLinkedCustomer : isolation tenant — même email, deux agences → deux lignes customers distinctes, jamais de fuite cross-agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `cross-tenant-${randomUUID()}@example.com`
  const authUserIdA = randomUUID()

  const idInA = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyA, traveler: traveler(email), linkedAuthUserId: authUserIdA }),
  )
  const idInB = await withTenantContext({ agencyId: agencyB, userId: "", isSuperAdmin: false }, (tx) =>
    resolveOrCreateLinkedCustomer(tx, { agencyId: agencyB, traveler: traveler(email), linkedAuthUserId: null }),
  )

  assert.notEqual(idInA, idInB, "chaque agence doit avoir sa propre ligne customer, même email")

  const rows = await withSystemContext((tx) =>
    tx.select({ id: customers.id, agencyId: customers.agencyId }).from(customers).where(eq(customers.email, email)),
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((r) => r.agencyId).sort(),
    [agencyA, agencyB].sort(),
  )
})
