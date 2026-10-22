/**
 * MUTUELLE-INVOICE-SETTLEMENT-01 × MUTUELLE-CONCURRENCY-COMPLETE-01
 * (réconciliation) — preuve live (Postgres réel) que :
 *
 *  1. recoverMutuelleInvoicesCore() détecte réellement une réservation
 *     Mutuelle confirmée sans facture (simulant un événement
 *     "booking/mutuelle.confirmed" perdu — process mort avant sendEvent) et
 *     génère une facture "issued"/amountPaid="0.00" — JAMAIS "paid".
 *  2. Le chemin rapide (équivalent au step.run de processMutuelleConfirmed)
 *     et le cron de récupération, exécutés en parallèle sur la MÊME
 *     réservation sans facture, ne produisent jamais deux factures —
 *     protection par la même contrainte DB
 *     (partner_invoices_reservation_uniq) que la concurrence pure déjà
 *     prouvée dans mutuelle-invoice-settlement-concurrency-live.test.ts.
 *
 * Ces deux preuves ferment les points "récupération après interruption" et
 * "absence de double facturation entre les deux chemins" du plan de
 * réconciliation.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  partnerInvoices,
  users,
  mutuelleGroups,
  mutuelleRequests,
} from "@/lib/db/schema"
import { generateIssuedInvoiceForReservation } from "@/lib/finance/invoice-actions"
import {
  recoverMutuelleInvoicesCore,
  findMutuelleReservationsMissingInvoice,
} from "../recover-mutuelle-missing-invoices"

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

/**
 * Construit une réservation Mutuelle confirmée, sans facture, traçable par
 * `findMutuelleReservationsMissingInvoice()` (providerPayload.channel =
 * 'mutuelle_b2b2c' + providerPayload.mutuelleRequestId -> mutuelleRequests
 * .reviewedByUserId, le "directorUserId" attendu par la récupération).
 */
async function createOrphanedMutuelleReservation(tndAmount: string): Promise<{
  agencyId: string
  reservationId: string
  directorUserId: string
}> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Mutuelle Recovery Test ${suffix}`,
        agencyType: "ota",
        slug: `mutuelle-recovery-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Test",
        lastName: `Member ${suffix}`,
      })
      .returning({ id: customers.id })
    const directorUserId = randomUUID()
    const memberUserId = randomUUID()
    await tx.insert(users).values([
      {
        id: directorUserId,
        agencyId: agency!.id,
        email: `director-${suffix}@test.local`,
        role: "mutuelle_director",
      },
      {
        id: memberUserId,
        agencyId: agency!.id,
        email: `member-${suffix}@test.local`,
        role: "mutuelle_member",
      },
    ])
    const [group] = await tx
      .insert(mutuelleGroups)
      .values({
        slug: `mutuelle-recovery-grp-${suffix}`,
        name: `Groupe Recovery Test ${suffix}`,
        executionAgencyId: agency!.id,
      })
      .returning({ id: mutuelleGroups.id })
    const [request] = await tx
      .insert(mutuelleRequests)
      .values({
        groupId: group!.id,
        memberUserId,
        module: "flight",
        description: "Test recovery",
        travelStartDate: "2026-12-01",
        travelEndDate: "2026-12-10",
        status: "approved",
        reviewedByUserId: directorUserId,
        reviewedAt: new Date(),
      })
      .returning({ id: mutuelleRequests.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `MUT-RECOV-${suffix}`,
        customerId: customer!.id,
        module: "flight",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: tndAmount,
        tndAmount,
        providerPayload: {
          channel: "mutuelle_b2b2c",
          mutuelleRequestId: request!.id,
        },
      })
      .returning({ id: reservations.id })
    return {
      agencyId: agency!.id,
      reservationId: reservation!.id,
      directorUserId,
    }
  })
}

async function cleanup(fixture: {
  agencyId: string
  reservationId: string
}): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.execute(
      sql`delete from audit_events where agency_id = ${fixture.agencyId}`,
    )
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, fixture.reservationId))
    await tx
      .delete(reservations)
      .where(eq(reservations.id, fixture.reservationId))
    await tx.execute(
      sql`delete from mutuelle_requests where group_id in (select id from mutuelle_groups where execution_agency_id = ${fixture.agencyId})`,
    )
    await tx.execute(
      sql`delete from mutuelle_groups where execution_agency_id = ${fixture.agencyId}`,
    )
    await tx.delete(users).where(eq(users.agencyId, fixture.agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, fixture.agencyId))
    await tx.delete(agencies).where(eq(agencies.id, fixture.agencyId))
  })
}

let recoveryFixture: Awaited<
  ReturnType<typeof createOrphanedMutuelleReservation>
> | null = null
let raceFixture: Awaited<
  ReturnType<typeof createOrphanedMutuelleReservation>
> | null = null

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  recoveryFixture = await createOrphanedMutuelleReservation("890.00")
  raceFixture = await createOrphanedMutuelleReservation("455.00")
})

after(async () => {
  if (!dbAvailable) return
  if (recoveryFixture) await cleanup(recoveryFixture)
  if (raceFixture) await cleanup(raceFixture)
})

test("RÉCUPÉRATION — réservation confirmée sans facture (événement perdu simulé) → recoverMutuelleInvoicesCore génère 1 facture issued", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const candidatesBefore = await findMutuelleReservationsMissingInvoice()
  assert.ok(
    candidatesBefore.some(
      (c) => c.reservationId === recoveryFixture!.reservationId,
    ),
    "la réservation orpheline doit être détectée par la requête de repérage",
  )

  const result = await recoverMutuelleInvoicesCore()
  assert.ok(result.checked >= 1)
  assert.ok(result.recovered >= 1)
  assert.equal(
    result.failed,
    0,
    "aucune ligne ne doit échouer dans ce scénario",
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, recoveryFixture!.reservationId)),
  )
  assert.ok(row, "une facture doit avoir été créée par la récupération")
  assert.equal(row!.status, "issued", "jamais 'paid' automatiquement")
  assert.equal(row!.amountPaid, "0.00")

  // Idempotence du cron lui-même : un second passage ne doit plus rien trouver
  // pour cette réservation (déjà facturée).
  const second = await recoverMutuelleInvoicesCore()
  const stillMissing = await findMutuelleReservationsMissingInvoice()
  assert.ok(
    !stillMissing.some(
      (c) => c.reservationId === recoveryFixture!.reservationId,
    ),
    "la réservation ne doit plus apparaître comme manquante après récupération",
  )
  void second
})

test("ABSENCE DE DOUBLE FACTURATION — chemin rapide et cron de récupération en parallèle sur la MÊME réservation → exactement 1 facture", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Bras A : équivalent du step.run "generate-mutuelle-invoice" de
  // processMutuelleConfirmed (appel direct à la même fonction, avec les
  // mêmes arguments issus de l'event — reproduit ici sans wrapper Inngest).
  const fastPath = generateIssuedInvoiceForReservation({
    agencyId: raceFixture!.agencyId,
    reservationId: raceFixture!.reservationId,
    actorUserId: raceFixture!.directorUserId,
  })
  // Bras B : le cron de récupération, qui détecterait la même réservation
  // tant qu'aucune facture n'existe encore.
  const cronPath = recoverMutuelleInvoicesCore()

  const [fastResult, cronResult] = await Promise.all([fastPath, cronPath])

  assert.ok(fastResult.ok, "le chemin rapide ne doit jamais échouer")
  assert.equal(
    cronResult.failed,
    0,
    "le cron ne doit jamais échouer sur cette réservation",
  )

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, raceFixture!.reservationId)),
  )
  assert.equal(
    rows.length,
    1,
    "exactement 1 facture au final, quel que soit l'ordre réel d'exécution",
  )
  assert.equal(rows[0]!.status, "issued")
  assert.equal(rows[0]!.amountPaid, "0.00")
})
