/**
 * PHASE 27.1 — Preuve live que `resolveMyGoAccessForTenant()` (le point
 * d'entrée unique désormais utilisé par Search/Booking/Cancel live, voir
 * lib/hotel-suppliers/tenant/live-resolution.ts) résout vraiment un compte
 * tenant configuré, et retombe explicitement sur le compte global
 * (`client: undefined`) sinon — jamais l'inverse. Contre un Postgres réel,
 * comme le reste de la suite de sécurité Phase 27 (voir
 * resolver-security.test.ts) — se dégrade en `skip` sans DB.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierCredentials,
} from "@/lib/db/schema"
import { encryptSecret } from "@/lib/security/secret-crypto"
import { resolveMyGoAccessForTenant } from "../live-resolution"

const TEST_KEY = "c".repeat(64)
process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY ??= TEST_KEY

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL) — voir resolver-security.test.ts pour la procédure."

let agencyConfigured = ""
let agencyUnconfigured = ""
let userConfigured = ""
let userUnconfigured = ""
let supplierId = ""
let accountId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyConfigured = randomUUID()
  agencyUnconfigured = randomUUID()
  userConfigured = randomUUID()
  userUnconfigured = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyConfigured, name: "P271 Agency Configured", agencyType: "ota", slug: `p271-cfg-${agencyConfigured.slice(0, 8)}` },
      { id: agencyUnconfigured, name: "P271 Agency Unconfigured", agencyType: "ota", slug: `p271-unc-${agencyUnconfigured.slice(0, 8)}` },
    ])
    const [supplier] = await tx
      .insert(hotelSuppliers)
      .values({ code: "mygo", name: "myGo", driver: "mygo", documentationStatus: "documented" })
      .onConflictDoNothing({ target: hotelSuppliers.code })
      .returning({ id: hotelSuppliers.id })
    if (supplier) {
      supplierId = supplier.id
    } else {
      const [existing] = await tx.select({ id: hotelSuppliers.id }).from(hotelSuppliers).where(eq(hotelSuppliers.code, "mygo"))
      supplierId = existing!.id
    }
  })

  await withTenantContext({ agencyId: agencyConfigured, userId: userConfigured, isSuperAdmin: false }, async (tx) => {
    const [account] = await tx
      .insert(hotelSupplierAccounts)
      .values({
        supplierId,
        ownerType: "agency",
        agencyId: agencyConfigured,
        displayName: "P271 test account",
        status: "active",
        mode: "virtual",
        priority: 100,
      })
      .returning({ id: hotelSupplierAccounts.id })
    accountId = account!.id
    const cred = encryptSecret({ login: "p271-login", password: "p271-password" })
    await tx.insert(hotelSupplierCredentials).values({
      accountId,
      agencyId: agencyConfigured,
      ciphertext: cred.ciphertext,
      keyVersion: cred.keyVersion,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    if (accountId) {
      await tx.delete(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, accountId))
      await tx.delete(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, accountId))
    }
    await tx.delete(agencies).where(eq(agencies.id, agencyConfigured))
    await tx.delete(agencies).where(eq(agencies.id, agencyUnconfigured))
  })
})

test("resolveMyGoAccessForTenant : agence AVEC compte configuré -> accountId non-null, client dédié (pas le singleton global)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyConfigured, userId: userConfigured, isSuperAdmin: false }
  const access = await resolveMyGoAccessForTenant(ctx)
  assert.equal(access.accountId, accountId)
  assert.notEqual(access.client, undefined)
})

test("resolveMyGoAccessForTenant : agence SANS compte configuré -> repli explicite (accountId null, client undefined)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyUnconfigured, userId: userUnconfigured, isSuperAdmin: false }
  const access = await resolveMyGoAccessForTenant(ctx)
  assert.equal(access.accountId, null)
  assert.equal(access.client, undefined)
})

test("resolveMyGoAccessForTenant : le driver résolu porte le bon accountId (jamais celui d'un autre tenant)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyConfigured, userId: userConfigured, isSuperAdmin: false }
  const ctxB: TenantContext = { agencyId: agencyUnconfigured, userId: userUnconfigured, isSuperAdmin: false }
  const accessA = await resolveMyGoAccessForTenant(ctxA)
  const accessB = await resolveMyGoAccessForTenant(ctxB)
  assert.notEqual(accessA.accountId, accessB.accountId)
})
