/**
 * NORMALIZED-MATCHING-01 — preuve live contre un Postgres réel que
 * `findMatchingCustomerIdsCore` matche par email/téléphone NORMALISÉ,
 * reproduisant exactement le cas réel trouvé en production
 * (VIP-DISTRIBUTION-AUDIT-01, 2026-10-07) : un client `+216 98 140 514`
 * (avec espaces) ne matchait jamais un lead `+21698140514` (sans
 * espaces) via l'ancienne égalité SQL stricte.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, customers } from "@/lib/db/schema"
import { findMatchingCustomerIdsCore } from "../customer-match-core"

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

let agencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      name: "NORMALIZED-MATCHING-01 Agency",
      agencyType: "ota",
      slug: `normalized-matching-01-${agencyId.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

function ctx(): TenantContext {
  return { agencyId, userId: "", isSuperAdmin: true }
}

test("findMatchingCustomerIdsCore : téléphone identique formaté différemment (cas réel production) => matche après normalisation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const [customer] = await withTenantContext(ctx(), (tx) =>
    tx
      .insert(customers)
      .values({
        agencyId,
        firstName: "QA",
        lastName: "Diagnostic",
        email: "qa-diagnostic@easy2book.test",
        phone: "+216 98 140 514",
      })
      .returning(),
  )

  const matched = await withTenantContext(ctx(), (tx) =>
    findMatchingCustomerIdsCore(tx, {
      agencyId,
      email: "tarhouni.hassene+qalead@gmail.com",
      phone: "+21698140514",
    }),
  )

  assert.ok(
    matched.includes(customer!.id),
    "même numéro, formats différents (espaces) — doit matcher après normalisation",
  )
})

test("findMatchingCustomerIdsCore : email avec casse différente => matche après normalisation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const [customer] = await withTenantContext(ctx(), (tx) =>
    tx
      .insert(customers)
      .values({
        agencyId,
        firstName: "Casse",
        lastName: "Test",
        email: "Mixed.Case@Example.TEST",
        phone: null,
      })
      .returning(),
  )

  const matched = await withTenantContext(ctx(), (tx) =>
    findMatchingCustomerIdsCore(tx, {
      agencyId,
      email: "mixed.case@example.test",
      phone: null,
    }),
  )

  assert.ok(matched.includes(customer!.id))
})

test("findMatchingCustomerIdsCore : aucun email ni téléphone fourni => tableau vide, jamais une liste arbitraire", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const matched = await withTenantContext(ctx(), (tx) =>
    findMatchingCustomerIdsCore(tx, { agencyId, email: null, phone: null }),
  )
  assert.deepEqual(matched, [])
})

test("findMatchingCustomerIdsCore : isolation stricte par agence — jamais de match cross-agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const otherAgencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: otherAgencyId,
      name: "Autre agence",
      agencyType: "ota",
      slug: `other-agency-${otherAgencyId.slice(0, 8)}`,
    }),
  )
  try {
    await withTenantContext(
      { agencyId: otherAgencyId, userId: "", isSuperAdmin: true },
      (tx) =>
        tx.insert(customers).values({
          agencyId: otherAgencyId,
          firstName: "Autre",
          lastName: "Agence",
          email: "cross-agency@example.test",
          phone: "+21699999999",
        }),
    )

    const matched = await withTenantContext(ctx(), (tx) =>
      findMatchingCustomerIdsCore(tx, {
        agencyId,
        email: "cross-agency@example.test",
        phone: "+21699999999",
      }),
    )
    assert.deepEqual(matched, [])
  } finally {
    await withSystemContext(async (tx) => {
      await tx.delete(customers).where(eq(customers.agencyId, otherAgencyId))
      await tx.delete(agencies).where(eq(agencies.id, otherAgencyId))
    })
  }
})
