/**
 * COMMERCIAL-AGREEMENT-WIRING-01 — preuve sur PostgreSQL réel qu'un accord
 * commercial ACTIF produit la part Easy2Book (option 3, D-01b) à la
 * réservation, et que sans accord rien ne change.
 *
 * Chaque test crée SA propre agence fixture (accords et lignes de taux
 * rattachés à elle seule) et la nettoie : aucune interférence entre tests,
 * aucun accord réel. L'écriture passe par `recordReservationFinancials()`
 * sous `withTenantContext` agence (rôle app_runtime + RLS), exactement comme
 * les parcours hôtel B2C/B2B — la lecture des accords sous RLS est donc
 * prouvée, pas supposée.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  commercialAgreements,
  customers,
  economicEntitlements,
  reservationFinancials,
  reservations,
  walletLedger,
} from "@/lib/db/schema"
import { marginRules } from "@/lib/db/schema/financials"
import {
  recordReservationFinancials,
  type EconomicEntitlementLineInput,
} from "../reservation-financials"
import {
  AgreementFeeError,
  computeAgreementFee,
  tunisDate,
} from "../agreement-fee"
import { reverseCommissionOnCancellation } from "../commission-reversal"
import {
  creditPlatformCommission,
  PLATFORM_COMMISSION_WALLET_ID,
} from "../platform-commission"

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

const fixtures: { agencyId: string; reservationIds: string[] }[] = []

after(async () => {
  if (!dbAvailable) return
  for (const f of fixtures) {
    for (const rid of f.reservationIds) {
      await cleanupAsSuperuser(
        (q) => q`delete from wallet_ledger where reservation_id = ${rid}`,
      )
      await cleanupAsSuperuser(
        (q) =>
          q`delete from economic_entitlements where reservation_id = ${rid}`,
      )
    }
    await withSystemContext(async (tx) => {
      for (const rid of f.reservationIds) {
        await tx
          .delete(reservationFinancials)
          .where(eq(reservationFinancials.reservationId, rid))
        await tx.delete(reservations).where(eq(reservations.id, rid))
      }
      await tx.delete(customers).where(eq(customers.agencyId, f.agencyId))
      await tx.delete(marginRules).where(eq(marginRules.agencyId, f.agencyId))
      await tx
        .delete(commercialAgreements)
        .where(eq(commercialAgreements.sellerPartyId, f.agencyId))
      await tx.delete(agencies).where(eq(agencies.id, f.agencyId))
    })
  }
})

// ─── Fixtures ──────────────────────────────────────────────────────────────

async function newAgency() {
  const agencyId = randomUUID()
  const f = { agencyId, reservationIds: [] as string[] }
  fixtures.push(f)
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `agreement-fee-${agencyId.slice(0, 8)}`,
      name: "COMMERCIAL-AGREEMENT-WIRING-01 fixture",
      agencyType: "ota",
    })
  })
  return f
}

async function newReservation(f: {
  agencyId: string
  reservationIds: string[]
}) {
  const suffix = randomUUID().slice(0, 8)
  const id = await withSystemContext(async (tx) => {
    const [c] = await tx
      .insert(customers)
      .values({
        agencyId: f.agencyId,
        civility: "M",
        firstName: "Accord",
        lastName: `Test ${suffix}`,
        phone: "20000002",
      })
      .returning({ id: customers.id })
    const [r] = await tx
      .insert(reservations)
      .values({
        agencyId: f.agencyId,
        publicRef: `TEST-AGR-${suffix}`,
        customerId: c!.id,
        module: "hotel",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id })
    return r!.id
  })
  f.reservationIds.push(id)
  return id
}

type AgreementSeed = {
  status?: "draft" | "active" | "suspended" | "terminated"
  channel?: "b2c" | "b2b"
  currency?: string
  validFrom?: string | null
  validTo?: string | null
  supplierPartyId?: string | null
  rules: Partial<typeof marginRules.$inferInsert>[]
}

async function seedAgreement(agencyId: string, a: AgreementSeed) {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(commercialAgreements)
      .values({
        sellerPartyType: "agency",
        sellerPartyId: agencyId,
        easy2bookRole: "platform",
        channel: a.channel ?? "b2c",
        currency: a.currency ?? "TND",
        status: a.status ?? "active",
        validFrom: a.validFrom ?? null,
        validTo: a.validTo ?? null,
        supplierPartyType: a.supplierPartyId ? "supplier_node" : null,
        supplierPartyId: a.supplierPartyId ?? null,
        createdByUserId: randomUUID(),
      })
      .returning({ id: commercialAgreements.id })
    const ruleIds: string[] = []
    for (const r of a.rules) {
      const [mr] = await tx
        .insert(marginRules)
        .values({
          agencyId,
          agreementId: row!.id,
          name: "accord test",
          productType: "hotel",
          type: "percent",
          ...r,
        })
        .returning({ id: marginRules.id })
      ruleIds.push(mr!.id)
    }
    return { agreementId: row!.id, ruleIds }
  })
}

/** Lignes construites comme dans lib/booking/guest-actions.ts (option 1 : 5 % de la marge). */
function hotelLines(
  agencyId: string,
  net: number,
  sale: number,
  commissionPercent: number,
  treatment: "non_refundable" | "full_reversal" = "non_refundable",
): EconomicEntitlementLineInput[] {
  const margin = sale - net
  const commission = Math.round(margin * (commissionPercent / 100) * 100) / 100
  return [
    {
      partyType: "external_supplier",
      partyId: null,
      role: "supplier",
      qualification: "supplier_cost",
      amount: net,
      basis: "coût fournisseur",
    },
    {
      partyType: "agency",
      partyId: agencyId,
      role: "seller",
      qualification: "seller_margin",
      amount: margin - commission,
      basis: "marge vendeur",
    },
    {
      partyType: "easy2book",
      partyId: null,
      role: "easy2book",
      qualification: "commission",
      amount: commission,
      basis: "commission option 1",
      cancellationTreatment: treatment,
    },
  ]
}

async function record(
  agencyId: string,
  reservationId: string,
  opts: {
    net?: number
    sale?: number
    channel?: "b2c" | "b2b"
    treatment?: "non_refundable" | "full_reversal"
    withContext?: boolean
  } = {},
) {
  const net = opts.net ?? 400
  const sale = opts.sale ?? 500
  return withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    async (tx) => {
      const res = await recordReservationFinancials({
        tx,
        reservationId,
        supplierPriceTnd: net,
        salePriceTnd: sale,
        commissionPercent: 5,
        economicEntitlements: hotelLines(
          agencyId,
          net,
          sale,
          5,
          opts.treatment,
        ),
        ...(opts.withContext === false
          ? {}
          : {
              agreementContext: {
                sellerAgencyId: agencyId,
                channel: opts.channel ?? "b2c",
                module: "hotel",
              },
            }),
      })
      await creditPlatformCommission(tx, {
        reservationId,
        commissionAmount: res.commissionAmount,
        description: "test accord",
      })
      return res
    },
  )
}

async function readBack(reservationId: string) {
  return withSystemContext(async (tx) => {
    const lines = await tx
      .select()
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, reservationId))
    const [fin] = await tx
      .select()
      .from(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
    const credits = await tx
      .select({ amount: walletLedger.amount })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          eq(walletLedger.reservationId, reservationId),
        ),
      )
    return { lines, fin, credits }
  })
}

const sum = (lines: { amount: string; compensatesId: string | null }[]) =>
  Math.round(
    lines
      .filter((l) => l.compensatesId === null)
      .reduce((s, l) => s + Number.parseFloat(l.amount), 0) * 100,
  ) / 100

async function expectRefusal(
  agencyId: string,
  reservationId: string,
  code: string,
) {
  await assert.rejects(
    record(agencyId, reservationId),
    (e: unknown) => e instanceof AgreementFeeError && e.code === code,
  )
  // Refus AVANT toute écriture : la transaction entière est annulée.
  const { lines, fin, credits } = await readBack(reservationId)
  assert.equal(lines.length, 0, `${code} : aucun droit écrit`)
  assert.equal(fin, undefined, `${code} : aucun reservation_financials`)
  assert.equal(credits.length, 0, `${code} : aucun crédit commission`)
}

// ─── Calcul pur ────────────────────────────────────────────────────────────

test("calcul option 3 : %, fixe, hybride, arrondi à 2 décimales (stockage numeric(14,2))", () => {
  const base = {
    agreementId: "a",
    ruleId: "r",
    percentValue: null,
    fixedValue: null,
  }
  assert.equal(
    computeAgreementFee(400, { ...base, type: "percent", percentValue: 2 })
      .amount,
    8,
  )
  assert.equal(
    computeAgreementFee(400, { ...base, type: "fixed", fixedValue: 25 }).amount,
    25,
  )
  assert.equal(
    computeAgreementFee(400, {
      ...base,
      type: "hybrid",
      percentValue: 1,
      fixedValue: 3,
    }).amount,
    7,
  )
  // 333.333 × 1,5 % = 4,999995 → 5,00 ; 123.45 × 3 % = 3,7035 → 3,70
  assert.equal(
    computeAgreementFee(333.333, {
      ...base,
      type: "percent",
      percentValue: 1.5,
    }).amount,
    5,
  )
  assert.equal(
    computeAgreementFee(123.45, { ...base, type: "percent", percentValue: 3 })
      .amount,
    3.7,
  )
  assert.throws(
    () =>
      computeAgreementFee(400, {
        ...base,
        type: "percent",
        percentValue: null,
      }),
    /AGREEMENT_RULE_INVALID/,
  )
  assert.throws(
    () => computeAgreementFee(400, { ...base, type: "fixed", fixedValue: -1 }),
    /AGREEMENT_RULE_INVALID/,
  )
})

test("date de validité évaluée au fuseau de Tunisie", () => {
  // 23:30 UTC le 31/12 = 00:30 le 01/01 à Tunis (UTC+1).
  assert.equal(tunisDate(new Date("2026-12-31T23:30:00Z")), "2027-01-01")
})

test("câblage : parcours hôtel B2C et B2B passent le contexte d'accord avec le bon canal", () => {
  const guest = readFileSync("lib/booking/guest-actions.ts", "utf8")
  const b2b = readFileSync("lib/booking/actions.ts", "utf8")
  assert.match(
    guest,
    /agreementContext: \{\s*sellerAgencyId: agencyId,\s*channel: "b2c",\s*module: "hotel",\s*\}/,
  )
  assert.match(
    b2b,
    /agreementContext: \{\s*sellerAgencyId: agencyId,\s*channel: "b2b",\s*module: "hotel",\s*\}/,
  )
})

// ─── Base réelle ───────────────────────────────────────────────────────────

test("live : aucun accord → option 1 strictement inchangée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  const rid = await newReservation(f)
  const res = await record(f.agencyId, rid)
  assert.equal(res.agreementId, null)
  assert.equal(res.commissionAmount, 5) // 100 × 5 %
  const { lines, fin, credits } = await readBack(rid)
  const e2b = lines.find((l) => l.role === "easy2book")!
  assert.equal(e2b.qualification, "commission")
  assert.equal(e2b.amount, "5.00")
  assert.equal(fin!.commissionAmount, "5.00")
  assert.equal(fin!.commissionPercent, "5.00")
  assert.equal(sum(lines), 500)
  assert.deepEqual(
    credits.map((c) => c.amount),
    ["5.00"],
  )
})

test("live : accord actif (2 % du net) → ligne platform_fee, marge vendeur réduite, prix inchangé", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  const { agreementId, ruleIds } = await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  const rid = await newReservation(f)
  const res = await record(f.agencyId, rid)
  assert.equal(res.agreementId, agreementId)
  assert.equal(res.commissionAmount, 8) // 400 × 2 %
  const { lines, fin, credits } = await readBack(rid)
  const e2b = lines.filter((l) => l.role === "easy2book")
  assert.equal(e2b.length, 1, "l'accord REMPLACE la commission option 1")
  assert.equal(e2b[0]!.qualification, "platform_fee")
  assert.equal(e2b[0]!.amount, "8.00")
  assert.equal(e2b[0]!.agreementId, agreementId)
  assert.equal(e2b[0]!.ruleId, ruleIds[0])
  assert.equal(e2b[0]!.status, "earned")
  assert.equal(e2b[0]!.cancellationTreatment, "non_refundable")
  assert.equal(lines.find((l) => l.role === "seller")!.amount, "92.00")
  assert.equal(lines.find((l) => l.role === "supplier")!.amount, "400.00")
  assert.equal(sum(lines), 500, "somme des droits = prix de vente (§3.2.1)")
  assert.equal(fin!.salePriceTnd, "500.00")
  assert.equal(fin!.commissionAmount, "8.00")
  assert.equal(fin!.commissionPercent, "8.00") // 8 / 100 de marge
  assert.deepEqual(
    credits.map((c) => c.amount),
    ["8.00"],
  )
})

test("live : frais fixes et hybrides", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f1 = await newAgency()
  await seedAgreement(f1.agencyId, {
    rules: [{ type: "fixed", fixedValue: "25.00" }],
  })
  const r1 = await newReservation(f1)
  assert.equal((await record(f1.agencyId, r1)).commissionAmount, 25)
  const f2 = await newAgency()
  await seedAgreement(f2.agencyId, {
    rules: [{ type: "hybrid", percentValue: "1.00", fixedValue: "3.00" }],
  })
  const r2 = await newReservation(f2)
  assert.equal((await record(f2.agencyId, r2)).commissionAmount, 7)
  assert.equal(sum((await readBack(r2)).lines), 500)
})

test("live : accords non applicables → inchangé (brouillon, suspendu, expiré, autre canal, autre module, fournisseur précis, autre agence)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  const other = await newAgency()
  const pct = [{ type: "percent" as const, percentValue: "2.00" }]
  await seedAgreement(f.agencyId, { status: "draft", rules: pct })
  await seedAgreement(f.agencyId, { status: "suspended", rules: pct })
  await seedAgreement(f.agencyId, { status: "terminated", rules: pct })
  await seedAgreement(f.agencyId, { validTo: "2020-12-31", rules: pct })
  await seedAgreement(f.agencyId, { validFrom: "2999-01-01", rules: pct })
  await seedAgreement(f.agencyId, { channel: "b2b", rules: pct })
  await seedAgreement(f.agencyId, {
    rules: [{ ...pct[0], productType: "omra" }],
  })
  await seedAgreement(f.agencyId, { rules: [{ ...pct[0], isActive: false }] })
  await seedAgreement(f.agencyId, { supplierPartyId: randomUUID(), rules: pct })
  await seedAgreement(f.agencyId, { rules: [] })
  await seedAgreement(other.agencyId, { rules: pct })
  const rid = await newReservation(f)
  const res = await record(f.agencyId, rid)
  assert.equal(res.agreementId, null)
  assert.equal(res.commissionAmount, 5)
  // Le même accord B2B s'applique bien sur le canal B2B.
  const rid2 = await newReservation(f)
  const res2 = await record(f.agencyId, rid2, { channel: "b2b" })
  assert.equal(res2.commissionAmount, 8)
})

test("live : sans agreementContext, un accord actif n'a aucun effet (modules non câblés)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  const rid = await newReservation(f)
  const res = await record(f.agencyId, rid, { withContext: false })
  assert.equal(res.agreementId, null)
  assert.equal(res.commissionAmount, 5)
})

test("live : priorité la plus haute retenue ; ligne propre au module ou générique", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [
      { type: "percent", percentValue: "2.00", priority: 1, productType: null },
      { type: "percent", percentValue: "3.00", priority: 5 },
    ],
  })
  const rid = await newReservation(f)
  assert.equal((await record(f.agencyId, rid)).commissionAmount, 12)
})

test("live : deux accords actifs applicables → refus, rien n'est écrit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  await seedAgreement(f.agencyId, {
    rules: [{ type: "fixed", fixedValue: "10.00" }],
  })
  await expectRefusal(f.agencyId, await newReservation(f), "AGREEMENT_CONFLICT")
})

test("live : deux lignes de taux de même priorité → refus", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [
      { type: "percent", percentValue: "2.00" },
      { type: "percent", percentValue: "3.00" },
    ],
  })
  await expectRefusal(
    f.agencyId,
    await newReservation(f),
    "AGREEMENT_RULE_CONFLICT",
  )
})

test("live : accord en EUR → refus, jamais de conversion", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    currency: "EUR",
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  await expectRefusal(
    f.agencyId,
    await newReservation(f),
    "AGREEMENT_CURRENCY_UNSUPPORTED",
  )
})

test("live : frais supérieurs à la marge vendeur → refus", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "fixed", fixedValue: "100.01" }],
  })
  await expectRefusal(
    f.agencyId,
    await newReservation(f),
    "AGREEMENT_FEE_EXCEEDS_SELLER_MARGIN",
  )
  // Frais = marge exactement : accepté, marge vendeur 0.
  const g = await newAgency()
  await seedAgreement(g.agencyId, {
    rules: [{ type: "fixed", fixedValue: "100.00" }],
  })
  const rid = await newReservation(g)
  assert.equal((await record(g.agencyId, rid)).commissionAmount, 100)
  assert.equal(
    (await readBack(rid)).lines.find((l) => l.role === "seller")!.amount,
    "0.00",
  )
})

test("live : ligne de taux à périmètre non géré ou invalide → refus", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  for (const rule of [
    { supplierId: randomUUID() },
    { destination: "TN" },
    { minPrice: "100.00" },
    { commissionPercent: "5.00" },
  ]) {
    const f = await newAgency()
    await seedAgreement(f.agencyId, {
      rules: [{ type: "percent", percentValue: "2.00", ...rule }],
    })
    await expectRefusal(
      f.agencyId,
      await newReservation(f),
      "AGREEMENT_RULE_UNSUPPORTED_SCOPE",
    )
  }
  const g = await newAgency()
  await seedAgreement(g.agencyId, {
    rules: [{ type: "percent", percentValue: null }],
  })
  await expectRefusal(
    g.agencyId,
    await newReservation(g),
    "AGREEMENT_RULE_INVALID",
  )
})

test("live : rejeu de l'écriture → refusé par l'unicité, aucun doublon de droits", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  const rid = await newReservation(f)
  await record(f.agencyId, rid)
  await assert.rejects(record(f.agencyId, rid))
  const { lines, credits } = await readBack(rid)
  assert.equal(lines.length, 3)
  assert.equal(credits.length, 1)
})

test("live : annulation → reversement de la ligne platform_fee (full_reversal), une seule fois", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  const rid = await newReservation(f)
  await record(f.agencyId, rid, { treatment: "full_reversal" })
  for (let i = 0; i < 2; i++) {
    await withSystemContext((tx) =>
      reverseCommissionOnCancellation(tx, {
        reservationId: rid,
        publicRef: "TEST-AGR",
        actorUserId: null,
      }),
    )
  }
  const { lines, credits } = await readBack(rid)
  const original = lines.find(
    (l) => l.qualification === "platform_fee" && !l.compensatesId,
  )!
  const comp = lines.filter((l) => l.compensatesId === original.id)
  assert.equal(comp.length, 1, "une seule compensation malgré le rejeu")
  assert.equal(comp[0]!.qualification, "platform_fee")
  assert.equal(comp[0]!.amount, "-8.00")
  assert.deepEqual(credits.map((c) => c.amount).sort(), ["-8.00", "8.00"])
})

test("live : annulation hôtel (non_refundable) → frais conservés, compensation à 0", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const f = await newAgency()
  await seedAgreement(f.agencyId, {
    rules: [{ type: "percent", percentValue: "2.00" }],
  })
  const rid = await newReservation(f)
  await record(f.agencyId, rid)
  await withSystemContext((tx) =>
    reverseCommissionOnCancellation(tx, {
      reservationId: rid,
      publicRef: "TEST-AGR",
      actorUserId: null,
    }),
  )
  const { lines, credits } = await readBack(rid)
  const comp = lines.filter((l) => l.compensatesId !== null)
  assert.equal(comp.length, 1)
  assert.equal(comp[0]!.qualification, "platform_fee")
  assert.equal(comp[0]!.amount, "0.00")
  assert.deepEqual(
    credits.map((c) => c.amount),
    ["8.00"],
  )
})
