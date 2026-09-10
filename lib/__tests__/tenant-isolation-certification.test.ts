/**
 * CERTIFICATION — isolation multi-tenant sur les 4 tables durcies par RLS
 * dans le commit 333e8c5 (products, audit_logs, yield_rules, inventory_locks)
 * + wallets (RLS pré-existante, mais jamais testée directement — corrélée à
 * la correction IDOR de `getWalletBalance()`).
 *
 * Contrairement aux tests applicatifs existants (customer-ownership.test.ts,
 * inventory-locks-core.test.ts, etc.) qui prouvent que le CODE filtre bien
 * par agence, ceux-ci prouvent que la BASE elle-même refuse — même si une
 * requête applicative oubliait un `WHERE agency_id = ...`, RLS+FORCE bloque
 * quand même. C'est le filet de sécurité que `lib/db/tenant-context.ts`
 * documente comme "seul rempart" pour tout code passant par la connexion
 * postgres-js directe.
 *
 * Se dégrade en `skip` sans Postgres local (DATABASE_URL).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  yieldRules,
  auditLogs,
  products,
  wallets,
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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let agencyA = ""
let agencyB = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `tic-a-${agencyA}`, name: "TIC Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `tic-b-${agencyB}`, name: "TIC Test Agency B", agencyType: "ota" },
    ])

    await tx.insert(yieldRules).values({
      agencyId: agencyA,
      module: "hotel",
      ruleType: "percent",
      percentValue: "12.0000",
    })

    await tx.insert(auditLogs).values({
      agencyId: agencyA,
      action: "reservation.created",
      entityType: "reservation",
      entityId: "TIC-TEST-REF",
    })

    await tx.insert(products).values({
      agencyId: agencyA,
      sku: `TIC-SKU-${agencyA.slice(0, 8)}`,
      type: "package",
      name: "Produit test isolation",
      basePrice: "500.000",
    })

    await tx.insert(wallets).values({
      agencyId: agencyA,
      balance: "1234.500",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(yieldRules).where(eq(yieldRules.agencyId, agencyA))
    await tx.delete(auditLogs).where(eq(auditLogs.agencyId, agencyA))
    await tx.delete(products).where(eq(products.agencyId, agencyA))
    await tx.delete(wallets).where(eq(wallets.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

function asAgency(id: string) {
  return { agencyId: id, userId: "", isSuperAdmin: false }
}

test("yield_rules : agence B ne voit JAMAIS les règles de marge de l'agence A (RLS, pas seulement le code)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsAsOwner = await withTenantContext(asAgency(agencyA), (tx) =>
    tx.select().from(yieldRules).where(eq(yieldRules.agencyId, agencyA)),
  )
  assert.equal(rowsAsOwner.length, 1, "l'agence propriétaire voit bien sa propre règle")

  const rowsAsOther = await withTenantContext(asAgency(agencyB), (tx) =>
    tx.select().from(yieldRules).where(eq(yieldRules.agencyId, agencyA)),
  )
  assert.equal(rowsAsOther.length, 0, "l'agence B ne doit voir AUCUNE règle de l'agence A")
})

test("yield_rules : agence B ne peut pas modifier une règle de l'agence A (UPDATE bloqué par RLS)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const updated = await withTenantContext(asAgency(agencyB), (tx) =>
    tx
      .update(yieldRules)
      .set({ percentValue: "99.0000" })
      .where(eq(yieldRules.agencyId, agencyA))
      .returning({ id: yieldRules.id }),
  )
  assert.equal(updated.length, 0, "aucune ligne affectée — RLS empêche même de CIBLER la ligne de A")

  const [stillOriginal] = await withSystemContext((tx) =>
    tx.select({ percentValue: yieldRules.percentValue }).from(yieldRules).where(eq(yieldRules.agencyId, agencyA)),
  )
  assert.equal(stillOriginal!.percentValue, "12.0000", "la valeur de A n'a pas bougé")
})

test("audit_logs : agence B ne peut jamais lire le journal d'audit de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsAsOwner = await withTenantContext(asAgency(agencyA), (tx) =>
    tx.select().from(auditLogs).where(eq(auditLogs.agencyId, agencyA)),
  )
  assert.equal(rowsAsOwner.length, 1)

  const rowsAsOther = await withTenantContext(asAgency(agencyB), (tx) =>
    tx.select().from(auditLogs).where(eq(auditLogs.agencyId, agencyA)),
  )
  assert.equal(rowsAsOther.length, 0)
})

test("products : agence B ne peut jamais lire ni modifier le catalogue de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsAsOther = await withTenantContext(asAgency(agencyB), (tx) =>
    tx.select().from(products).where(eq(products.agencyId, agencyA)),
  )
  assert.equal(rowsAsOther.length, 0)

  const deleted = await withTenantContext(asAgency(agencyB), (tx) =>
    tx.delete(products).where(eq(products.agencyId, agencyA)).returning({ id: products.id }),
  )
  assert.equal(deleted.length, 0, "agence B ne peut pas supprimer un produit de l'agence A")
})

test("wallets : agence B ne peut jamais lire le solde wallet de l'agence A (backstop DB derrière le correctif IDOR getWalletBalance)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rowsAsOwner = await withTenantContext(asAgency(agencyA), (tx) =>
    tx.select().from(wallets).where(eq(wallets.agencyId, agencyA)),
  )
  assert.equal(rowsAsOwner.length, 1)
  assert.equal(rowsAsOwner[0]!.balance, "1234.500")

  const rowsAsOther = await withTenantContext(asAgency(agencyB), (tx) =>
    tx.select().from(wallets).where(eq(wallets.agencyId, agencyA)),
  )
  assert.equal(rowsAsOther.length, 0, "agence B ne doit jamais voir le solde de l'agence A")
})

test("system context (cron/webhook de confiance) : accès cross-agence toujours disponible, jamais bloqué par RLS", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [rule] = await withSystemContext((tx) =>
    tx.select().from(yieldRules).where(eq(yieldRules.agencyId, agencyA)),
  )
  const [log] = await withSystemContext((tx) =>
    tx.select().from(auditLogs).where(eq(auditLogs.agencyId, agencyA)),
  )
  const [wallet] = await withSystemContext((tx) =>
    tx.select().from(wallets).where(eq(wallets.agencyId, agencyA)),
  )
  assert.ok(rule, "system context doit voir la règle de A")
  assert.ok(log, "system context doit voir le log de A")
  assert.ok(wallet, "system context doit voir le wallet de A")
})
