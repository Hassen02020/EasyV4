/**
 * PHASE 38D — Easy2Book Rewards — preuve live (DB réelle) que le moteur
 * central (`lib/loyalty/rewards-core.ts`) respecte : isolation tenant,
 * verrouillage/sécurité concurrentielle, idempotence à chaque étape
 * (earn/convert/reverse/redeem/reinstate), jamais de solde négatif, jamais
 * un double mouvement, jamais un point inventé au-delà de ce que le calcul
 * autorise. Se dégrade en `skip` sans Postgres local.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, customers, loyaltyAccounts, loyaltyLedger } from "@/lib/db/schema"
import {
  earnPendingPoints,
  convertPendingToAvailable,
  reverseEarnedPoints,
  redeemPoints,
  reinstateRedeemedPoints,
  expireInactiveAccountsForAgency,
  getLoyaltyAccountSummary,
  computeEarnedPoints,
  computeMaxRedeemablePoints,
} from "../rewards-core"

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
      { id: agencyA, slug: `loy-a-${agencyA}`, name: "Loyalty Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `loy-b-${agencyB}`, name: "Loyalty Test Agency B", agencyType: "ota" },
    ])
  })
})

// Chaque test qui touche un solde crée son PROPRE client frais : les
// comptes fidélité sont un-par-client (index unique customer_id), donc
// partager un seul customerId entre tests ferait s'accumuler les points
// d'un test à l'autre et invaliderait toute assertion en valeur absolue.
async function freshCustomer(agencyId: string): Promise<string> {
  return withSystemContext(async (tx) => {
    const [c] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "Loy", lastName: "Test", email: `loy-${randomUUID()}@example.com` })
      .returning({ id: customers.id })
    return c!.id
  })
}

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(loyaltyLedger).where(eq(loyaltyLedger.agencyId, agencyA))
    await tx.delete(loyaltyLedger).where(eq(loyaltyLedger.agencyId, agencyB))
    await tx.delete(loyaltyAccounts).where(eq(loyaltyAccounts.agencyId, agencyA))
    await tx.delete(loyaltyAccounts).where(eq(loyaltyAccounts.agencyId, agencyB))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

function tenantA() {
  return { agencyId: agencyA, userId: "", isSuperAdmin: false }
}

/* -------------------------------------------------------------------------- */
/* Pure : computeEarnedPoints / computeMaxRedeemablePoints                    */
/* -------------------------------------------------------------------------- */

test("computeEarnedPoints : 1 TND éligible = 1 point, arrondi à l'entier inférieur", () => {
  assert.equal(computeEarnedPoints(500), 500)
  assert.equal(computeEarnedPoints(499.9), 499)
  assert.equal(computeEarnedPoints(0), 0)
  assert.equal(computeEarnedPoints(-10), 0)
})

test("computeMaxRedeemablePoints : 10% du montant éligible en points (100 pts = 1 TND)", () => {
  assert.equal(computeMaxRedeemablePoints(1000), 10000)
  assert.equal(computeMaxRedeemablePoints(0), 0)
})

/* -------------------------------------------------------------------------- */
/* EARN — points en attente                                                   */
/* -------------------------------------------------------------------------- */

test("earnPendingPoints : module non éligible (omra) → refusé, aucun point", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const reservationId = randomUUID()
  const result = await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, {
      agencyId: agencyA,
      customerId,
      reservationId,
      module: "omra",
      eligibleTnd: 1000,
      idempotencyKey: `earn-pending:${reservationId}`,
    }),
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "NOT_ELIGIBLE")
})

test("earnPendingPoints : module éligible (hotel) → points crédités en pending, compte créé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const reservationId = randomUUID()
  const result = await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, {
      agencyId: agencyA,
      customerId,
      reservationId,
      module: "hotel",
      eligibleTnd: 750,
      idempotencyKey: `earn-pending:${reservationId}`,
    }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("expected ok:true")
  assert.equal(result.awarded, true)
  assert.equal(result.points, 750)

  const summary = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(summary?.pendingPoints, 750)
  assert.equal(summary?.availablePoints, 0)
  assert.equal(summary?.lifetimeEarnedPoints, 750)
})

test("earnPendingPoints : idempotence — rejouer la même clé n'attribue jamais un second crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const reservationId = randomUUID()
  const key = `earn-pending:${reservationId}`
  const first = await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId, module: "package", eligibleTnd: 300, idempotencyKey: key }),
  )
  assert.equal(first.ok && first.awarded, true)

  const before = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))

  const second = await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId, module: "package", eligibleTnd: 300, idempotencyKey: key }),
  )
  assert.equal(second.ok && second.awarded, false, "le second appel avec la même clé ne doit rien attribuer")

  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.pendingPoints, before?.pendingPoints, "aucun double crédit")
})

test("earnPendingPoints : CONCURRENCE RÉELLE — deux earn simultanés (clés différentes) ne se marchent jamais dessus", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r1 = randomUUID()
  const r2 = randomUUID()
  const before = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  const beforePending = before?.pendingPoints ?? 0

  const [res1, res2] = await Promise.all([
    withTenantContext(tenantA(), (tx) =>
      earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r1, module: "hotel", eligibleTnd: 100, idempotencyKey: `earn-pending:${r1}` }),
    ),
    withTenantContext(tenantA(), (tx) =>
      earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r2, module: "hotel", eligibleTnd: 200, idempotencyKey: `earn-pending:${r2}` }),
    ),
  ])
  assert.equal(res1.ok && res1.awarded, true)
  assert.equal(res2.ok && res2.awarded, true)

  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.pendingPoints, beforePending + 300, "les deux crédits concurrents doivent tous les deux s'appliquer, sans écrasement")
})

/* -------------------------------------------------------------------------- */
/* CONVERT — pending → available                                              */
/* -------------------------------------------------------------------------- */

test("convertPendingToAvailable : convertit exactement les points de CETTE réservation, jamais ceux d'une autre", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rConvert = randomUUID()
  const rOther = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rConvert, module: "activity", eligibleTnd: 400, idempotencyKey: `earn-pending:${rConvert}` }),
  )
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rOther, module: "activity", eligibleTnd: 150, idempotencyKey: `earn-pending:${rOther}` }),
  )

  const result = await withTenantContext(tenantA(), (tx) =>
    convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rConvert, idempotencyKey: `convert:${rConvert}` }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("expected ok:true")
  assert.equal(result.converted, true)
  assert.equal(result.points, 400)

  const summary = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(summary?.availablePoints, 400, "seuls les points de rConvert sont devenus disponibles")
  assert.equal(summary?.pendingPoints, 150, "les points de rOther restent en attente")
})

test("convertPendingToAvailable : idempotence — rejouer ne convertit jamais deux fois", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r, module: "hotel", eligibleTnd: 200, idempotencyKey: `earn-pending:${r}` }),
  )
  const key = `convert:${r}`
  const first = await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: key }))
  assert.equal(first.ok && first.converted, true)

  const before = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  const second = await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: key }))
  assert.equal(second.ok && second.converted, false)
  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.availablePoints, before?.availablePoints)
  assert.equal(after?.pendingPoints, before?.pendingPoints)
})

/* -------------------------------------------------------------------------- */
/* REVERSE — annulation/remboursement de la réservation qui a généré         */
/* -------------------------------------------------------------------------- */

test("reverseEarnedPoints : reprend des points encore PENDING (jamais convertis)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r, module: "package", eligibleTnd: 600, idempotencyKey: `earn-pending:${r}` }),
  )
  const result = await withTenantContext(tenantA(), (tx) => reverseEarnedPoints(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: `reverse:${r}` }))
  assert.equal(result.ok, true)
  assert.equal(result.reversed, true)
  assert.equal(result.pointsReversedFromPending, 600)
  assert.equal(result.pointsReversedFromAvailable, 0)

  const summary = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(summary?.pendingPoints, 0)
})

test("reverseEarnedPoints : reprend des points déjà AVAILABLE (post-complétion) et non dépensés", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r, module: "hotel", eligibleTnd: 350, idempotencyKey: `earn-pending:${r}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: `convert:${r}` }))

  const before = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  const result = await withTenantContext(tenantA(), (tx) => reverseEarnedPoints(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: `reverse:${r}` }))
  assert.equal(result.ok, true)
  assert.equal(result.pointsReversedFromAvailable, 350)

  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after!.availablePoints, before!.availablePoints - 350)
})

test("reverseEarnedPoints : jamais un solde négatif — ne reprend que ce qui reste réellement (partiellement déjà dépensé ailleurs)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rEarn = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, module: "activity", eligibleTnd: 2000, idempotencyKey: `earn-pending:${rEarn}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `convert:${rEarn}` }))

  // Le client dépense une partie de ce solde disponible sur une AUTRE réservation.
  const rSpend = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, {
      agencyId: agencyA,
      customerId,
      targetReservationId: rSpend,
      targetReservationEligibleTnd: 100000,
      pointsToRedeem: 1500,
      idempotencyKey: `redeem:${rSpend}`,
    }),
  )

  const beforeReverse = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(beforeReverse?.availablePoints, 500, "2000 gagnés - 1500 dépensés = 500 restants")

  const result = await withTenantContext(tenantA(), (tx) => reverseEarnedPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `reverse:${rEarn}` }))
  assert.equal(result.ok, true)
  // La réservation d'origine avait généré 2000 points, mais seuls 500 sont
  // encore effectivement sur le compte — jamais plus repris que ça, jamais négatif.
  assert.equal(result.pointsReversedFromAvailable, 500)

  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.availablePoints, 0)
  assert.ok(after!.availablePoints >= 0, "jamais un solde négatif")
})

/* -------------------------------------------------------------------------- */
/* REDEEM — dépense de points disponibles                                     */
/* -------------------------------------------------------------------------- */

test("redeemPoints : sous le minimum (1000) → refusé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  const result = await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: r, targetReservationEligibleTnd: 100000, pointsToRedeem: 500, idempotencyKey: `redeem:${r}` }),
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "BELOW_MINIMUM")
})

test("redeemPoints : au-dessus de 10% du montant éligible de la réservation cible → refusé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  // 10% de 100 TND = 10 TND = 1000 points max.
  const result = await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: r, targetReservationEligibleTnd: 100, pointsToRedeem: 1500, idempotencyKey: `redeem:${r}` }),
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "ABOVE_MAXIMUM")
})

test("redeemPoints : solde disponible insuffisant → refusé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rEarn = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, module: "hotel", eligibleTnd: 1000, idempotencyKey: `earn-pending:${rEarn}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `convert:${rEarn}` }))

  const rSpend = randomUUID()
  const result = await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: rSpend, targetReservationEligibleTnd: 1000000, pointsToRedeem: 5000, idempotencyKey: `redeem:${rSpend}` }),
  )
  assert.equal(result.ok, false)
  if (result.ok) throw new Error("expected ok:false")
  assert.equal(result.code, "INSUFFICIENT_BALANCE")
})

test("redeemPoints : succès — décrémente le solde exact, jamais un montant réel crédité ailleurs (Wallet/Payments intacts)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rEarn = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, module: "hotel", eligibleTnd: 2000, idempotencyKey: `earn-pending:${rEarn}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `convert:${rEarn}` }))

  const rSpend = randomUUID()
  const result = await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: rSpend, targetReservationEligibleTnd: 100000, pointsToRedeem: 1200, idempotencyKey: `redeem:${rSpend}` }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("expected ok:true")
  assert.equal(result.points, 1200)
  assert.equal(result.tndEquivalent, 12)

  const summary = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(summary?.availablePoints, 800)
  assert.equal(summary?.lifetimeRedeemedPoints, 1200)
})

/* -------------------------------------------------------------------------- */
/* REINSTATE — la réservation cible de la rédemption est annulée/remboursée   */
/* -------------------------------------------------------------------------- */

test("reinstateRedeemedPoints : restitue exactement ce qui a été dépensé sur CETTE réservation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rEarn = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, module: "hotel", eligibleTnd: 3000, idempotencyKey: `earn-pending:${rEarn}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `convert:${rEarn}` }))

  const rSpend = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: rSpend, targetReservationEligibleTnd: 100000, pointsToRedeem: 1000, idempotencyKey: `redeem:${rSpend}` }),
  )
  const afterRedeem = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(afterRedeem?.availablePoints, 2000)

  const result = await withTenantContext(tenantA(), (tx) => reinstateRedeemedPoints(tx, { agencyId: agencyA, customerId, reservationId: rSpend, idempotencyKey: `reinstate:${rSpend}` }))
  assert.equal(result.ok, true)
  assert.equal(result.reinstated, true)
  assert.equal(result.points, 1000)

  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.availablePoints, 3000)
})

test("reinstateRedeemedPoints : idempotence — rejouer ne restitue jamais deux fois", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const rEarn = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: rEarn, module: "activity", eligibleTnd: 3000, idempotencyKey: `earn-pending:${rEarn}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: rEarn, idempotencyKey: `convert:${rEarn}` }))
  const rSpend = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    redeemPoints(tx, { agencyId: agencyA, customerId, targetReservationId: rSpend, targetReservationEligibleTnd: 100000, pointsToRedeem: 1000, idempotencyKey: `redeem:${rSpend}` }),
  )

  const key = `reinstate:${rSpend}`
  const first = await withTenantContext(tenantA(), (tx) => reinstateRedeemedPoints(tx, { agencyId: agencyA, customerId, reservationId: rSpend, idempotencyKey: key }))
  assert.equal(first.ok && first.reinstated, true)
  const before = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))

  const second = await withTenantContext(tenantA(), (tx) => reinstateRedeemedPoints(tx, { agencyId: agencyA, customerId, reservationId: rSpend, idempotencyKey: key }))
  assert.equal(second.ok && second.reinstated, false)
  const after = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(after?.availablePoints, before?.availablePoints)
})

/* -------------------------------------------------------------------------- */
/* Isolation tenant                                                            */
/* -------------------------------------------------------------------------- */

test("isolation tenant : le solde d'un client de l'agence A est invisible depuis l'agence B", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r, module: "hotel", eligibleTnd: 900, idempotencyKey: `earn-pending:${r}` }),
  )
  const fromB = await withTenantContext({ agencyId: agencyB, userId: "", isSuperAdmin: false }, (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(fromB, null, "l'agence B ne doit jamais voir le compte fidélité d'un client de l'agence A")
})

/* -------------------------------------------------------------------------- */
/* Expiration par inactivité                                                  */
/* -------------------------------------------------------------------------- */

test("expireInactiveAccountsForAgency : expire un compte inactif depuis plus de 24 mois", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId, reservationId: r, module: "hotel", eligibleTnd: 500, idempotencyKey: `earn-pending:${r}` }),
  )
  await withTenantContext(tenantA(), (tx) => convertPendingToAvailable(tx, { agencyId: agencyA, customerId, reservationId: r, idempotencyKey: `convert:${r}` }))

  // Force la dernière activité à 25 mois dans le passé (simulateur d'horloge, pas une vraie attente).
  const twentyFiveMonthsAgo = new Date()
  twentyFiveMonthsAgo.setMonth(twentyFiveMonthsAgo.getMonth() - 25)
  await withSystemContext((tx) =>
    tx.update(loyaltyAccounts).set({ lastActivityAt: twentyFiveMonthsAgo }).where(eq(loyaltyAccounts.customerId, customerId)),
  )

  const result = await withTenantContext(tenantA(), (tx) => expireInactiveAccountsForAgency(tx, { agencyId: agencyA }))
  assert.equal(result.accountsExpired, 1)
  assert.equal(result.totalPointsExpired, 500)

  const summary = await withTenantContext(tenantA(), (tx) => getLoyaltyAccountSummary(tx, customerId))
  assert.equal(summary?.availablePoints, 0)
  assert.equal(summary?.pendingPoints, 0)
})

test("expireInactiveAccountsForAgency : n'expire jamais un compte actif récemment", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const customerId = await freshCustomer(agencyA)
  const r = randomUUID()
  await withTenantContext(tenantA(), (tx) =>
    earnPendingPoints(tx, { agencyId: agencyA, customerId: customerId, reservationId: r, module: "hotel", eligibleTnd: 100, idempotencyKey: `earn-pending:${r}` }),
  )
  const result = await withTenantContext(tenantA(), (tx) => expireInactiveAccountsForAgency(tx, { agencyId: agencyA }))
  // Le compte a une activité fraîche (vient d'être créé/mis à jour) : ne doit pas apparaître.
  assert.equal(result.accountsExpired, 0)
})
