/**
 * F-3 (SETTLE-PLATFORM-FEE-01) — preuve sur PostgreSQL réel (rôle
 * app_runtime, même appel que settleCommissions) que
 * `mark_econ_commission_settled` marque comme réglée la part Easy2Book d'un
 * accord (`platform_fee` avec `agreement_id`, PR #334) et sa contre-écriture
 * d'annulation, sans jamais marquer le frais bancaire de change des vols
 * (`platform_fee` négatif, sans accord) ni les lignes fournisseur/vendeur.
 *
 * Exemple chiffré : Network 500 TND, net 400, accord 2 % du net → part
 * Easy2Book 8 TND créditée au portefeuille (catégorie commission) et réglée
 * par le lot ; avant F-3 la ligne de droit restait « non réglée ».
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  commissionSettlements,
  customers,
  economicEntitlements,
  reservations,
} from "@/lib/db/schema"

let dbAvailable = false
const skip = () => "Postgres local indisponible (DATABASE_URL)."

before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
})

type Line = {
  key: string
  role: "supplier" | "seller" | "easy2book" | "partner"
  qualification: string
  partyType: string
  amount: string
  agreementId?: string | null
  compensatesKey?: string
}

/** Agence + réservation + lignes de droits données ; renvoie les ids par clé. */
async function seed(lines: Line[]) {
  const s = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `F3 ${s}`, agencyType: "ota", slug: `f3-${s}` })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId: agency!.id, firstName: "F3", lastName: s })
      .returning({ id: customers.id })
    const [res] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `F3-${s}`,
        customerId: customer!.id,
        module: "network",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id })
    const ids: Record<string, string> = {}
    for (const l of lines) {
      const [row] = await tx
        .insert(economicEntitlements)
        .values({
          reservationId: res!.id,
          partyType: l.partyType,
          partyId: l.partyType === "agency" ? agency!.id : null,
          role: l.role,
          qualification: l.qualification,
          amount: l.amount,
          basis: `F3 ${l.key}`,
          agreementId: l.agreementId ?? null,
          status: l.compensatesKey ? "compensated" : "earned",
          effectiveAt: new Date(),
          compensatesId: l.compensatesKey ? ids[l.compensatesKey]! : null,
        })
        .returning({ id: economicEntitlements.id })
      ids[l.key] = row!.id
    }
    return { reservationId: res!.id, ids }
  })
}

let periodSeq = 0
/** Lot de règlement (période unique) puis appel identique à settleCommissions. */
async function settle(reservationIds: string[]) {
  return withSystemContext(async (tx) => {
    // Période unique par appel (contrainte commission_settlements_period_uniq).
    const day = new Date(Date.UTC(1990, 0, 1) + periodSeq++ * 86_400_000)
    const offset = Math.floor(Math.random() * 3000) * 86_400_000 * 30
    const d = new Date(day.getTime() + offset).toISOString().slice(0, 10)
    const [st] = await tx
      .insert(commissionSettlements)
      .values({ periodStart: d, periodEnd: d, totalAmount: "8.00" })
      .returning({ id: commissionSettlements.id })
    const literal = `{${reservationIds.join(",")}}`
    await tx.execute(
      sql`SELECT mark_econ_commission_settled(${literal}::uuid[], ${st!.id}::uuid)`,
    )
    return st!.id
  })
}

async function statusOf(id: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        settlementStatus: economicEntitlements.settlementStatus,
        settlementRef: economicEntitlements.settlementRef,
      })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.id, id)),
  )
  return row!
}

const base: Line[] = [
  {
    key: "supplier",
    role: "supplier",
    qualification: "supplier_cost",
    partyType: "external_supplier",
    amount: "400.00",
  },
  {
    key: "seller",
    role: "seller",
    qualification: "seller_margin",
    partyType: "agency",
    amount: "92.00",
  },
]

test("live : part Easy2Book d'un accord (platform_fee) marquée réglée avec le lot", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed([
    ...base,
    {
      key: "fee",
      role: "easy2book",
      qualification: "platform_fee",
      partyType: "easy2book",
      amount: "8.00",
      agreementId: randomUUID(),
    },
  ])
  const stId = await settle([f.reservationId])
  assert.deepEqual(await statusOf(f.ids.fee!), {
    settlementStatus: "settled",
    settlementRef: stId,
  })
  // Fournisseur et vendeur ne relèvent pas du règlement des commissions.
  assert.equal((await statusOf(f.ids.supplier!)).settlementStatus, null)
  assert.equal((await statusOf(f.ids.seller!)).settlementStatus, null)
})

test("live : contre-écriture d'annulation d'une part d'accord (sans agreement_id) marquée aussi", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed([
    ...base,
    {
      key: "fee",
      role: "easy2book",
      qualification: "platform_fee",
      partyType: "easy2book",
      amount: "8.00",
      agreementId: randomUUID(),
    },
    // Telle qu'écrite par reverseCommissionOnCancellation : qualification
    // recopiée, agreement_id absent, compensates_id → part d'accord.
    {
      key: "rev",
      role: "easy2book",
      qualification: "platform_fee",
      partyType: "easy2book",
      amount: "0.00",
      compensatesKey: "fee",
    },
  ])
  const stId = await settle([f.reservationId])
  assert.equal((await statusOf(f.ids.rev!)).settlementStatus, "settled")
  assert.equal((await statusOf(f.ids.rev!)).settlementRef, stId)
})

test("live : commission option 1 et sa contre-écriture — comportement inchangé", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed([
    ...base,
    {
      key: "com",
      role: "easy2book",
      qualification: "commission",
      partyType: "easy2book",
      amount: "5.00",
    },
    {
      key: "rev",
      role: "easy2book",
      qualification: "commission",
      partyType: "easy2book",
      amount: "0.00",
      compensatesKey: "com",
    },
  ])
  await settle([f.reservationId])
  assert.equal((await statusOf(f.ids.com!)).settlementStatus, "settled")
  assert.equal((await statusOf(f.ids.rev!)).settlementStatus, "settled")
})

test("live : frais bancaire de change des vols (platform_fee négatif, sans accord) jamais marqué", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed([
    ...base,
    {
      key: "com",
      role: "easy2book",
      qualification: "commission",
      partyType: "easy2book",
      amount: "5.00",
    },
    {
      key: "fx",
      role: "easy2book",
      qualification: "platform_fee",
      partyType: "easy2book",
      amount: "-1.20",
    },
  ])
  await settle([f.reservationId])
  assert.equal((await statusOf(f.ids.com!)).settlementStatus, "settled")
  assert.equal((await statusOf(f.ids.fx!)).settlementStatus, null)
})

test("live : réservation hors lot jamais marquée ; rejeu sans effet sur le lot d'origine", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const fee: Line = {
    key: "fee",
    role: "easy2book",
    qualification: "platform_fee",
    partyType: "easy2book",
    amount: "8.00",
    agreementId: randomUUID(),
  }
  const inLot = await seed([...base, fee])
  const outLot = await seed([...base, { ...fee, agreementId: randomUUID() }])
  const stId = await settle([inLot.reservationId])
  assert.equal((await statusOf(outLot.ids.fee!)).settlementStatus, null)
  // Rejeu du même appel avec le même lot : état identique.
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT mark_econ_commission_settled(${`{${inLot.reservationId}}`}::uuid[], ${stId}::uuid)`,
    ),
  )
  assert.deepEqual(await statusOf(inLot.ids.fee!), {
    settlementStatus: "settled",
    settlementRef: stId,
  })
})

test("live : commission ou platform_fee d'un autre bénéficiaire qu'Easy2Book jamais marquée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed([
    ...base,
    {
      key: "partnerCom",
      role: "partner",
      qualification: "commission",
      partyType: "agency",
      amount: "3.00",
    },
    {
      key: "partnerFee",
      role: "partner",
      qualification: "platform_fee",
      partyType: "agency",
      amount: "2.00",
      agreementId: randomUUID(),
    },
  ])
  await settle([f.reservationId])
  assert.equal((await statusOf(f.ids.partnerCom!)).settlementStatus, null)
  assert.equal((await statusOf(f.ids.partnerFee!)).settlementStatus, null)
})

test("live : app_runtime n'a toujours pas d'UPDATE direct sur economic_entitlements", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await seed(base)
  await assert.rejects(
    withSystemContext((tx) =>
      tx.execute(
        sql`UPDATE economic_entitlements SET settlement_status = 'settled' WHERE reservation_id = ${f.reservationId}`,
      ),
    ),
  )
})
