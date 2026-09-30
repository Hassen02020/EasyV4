/**
 * JOURNEY-BUILDER-01 — `deriveJourneyStatus` (pure, aucune DB requise) +
 * preuve live contre un Postgres réel pour le reste (même convention que
 * `lib/pro/__tests__/margins-core.test.ts` : `skip` sans DATABASE_URL).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations } from "@/lib/db/schema"
import {
  deriveJourneyStatus,
  createJourneyCore,
  addJourneyLineCore,
  removeJourneyLineCore,
  casLineToProcessingCore,
  recordLineOutcomeCore,
  getJourneyWithLinesCore,
} from "../journeys-core"

test("deriveJourneyStatus : 0 ligne -> draft", () => {
  assert.equal(deriveJourneyStatus([]), "draft")
})

test("deriveJourneyStatus : toutes pending -> ready", () => {
  assert.equal(deriveJourneyStatus([{ status: "pending" }, { status: "pending" }]), "ready")
})

test("deriveJourneyStatus : au moins une processing -> processing (même avec confirmed/failed déjà présents)", () => {
  assert.equal(
    deriveJourneyStatus([{ status: "confirmed" }, { status: "processing" }, { status: "failed" }]),
    "processing",
  )
})

test("deriveJourneyStatus : toutes confirmed -> confirmed", () => {
  assert.equal(deriveJourneyStatus([{ status: "confirmed" }, { status: "confirmed" }]), "confirmed")
})

test("deriveJourneyStatus : toutes failed -> failed", () => {
  assert.equal(deriveJourneyStatus([{ status: "failed" }, { status: "failed" }]), "failed")
})

test("deriveJourneyStatus : mélange confirmed/failed -> partially_confirmed (exemple exact de la décision produit : Flight OK, Hotel OK, Transfer FAILED)", () => {
  assert.equal(
    deriveJourneyStatus([{ status: "confirmed" }, { status: "confirmed" }, { status: "failed" }]),
    "partially_confirmed",
  )
})

test("deriveJourneyStatus : mélange confirmed + pending (pas encore tout tenté) -> partially_confirmed", () => {
  assert.equal(deriveJourneyStatus([{ status: "confirmed" }, { status: "pending" }]), "partially_confirmed")
})

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
let customerId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    const suffix = randomUUID().slice(0, 8)
    const [agency] = await tx
      .insert(agencies)
      .values({ name: `Journey Test Agency ${suffix}`, agencyType: "partner", slug: `journey-test-${suffix}` })
      .returning({ id: agencies.id })
    agencyId = agency!.id
    const [customer] = await tx
      .insert(customers)
      .values({ agencyId, civility: "M", firstName: "Test", lastName: "Client", phone: "20000000" })
      .returning({ id: customers.id })
    customerId = customer!.id
  })
})

after(async () => {
  if (!dbAvailable || !agencyId) return
  await withSystemContext(async (tx) => {
    // reservations.agency_id est en onDelete:"restrict" (jamais cascade sur
    // une donnée financière) — les réservations de test créées par les cas
    // ci-dessus doivent être supprimées avant l'agence elle-même.
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("createJourneyCore + addJourneyLineCore : statut draft -> ready après ajout d'une ligne pending", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID(), customerId })
    assert.equal(journey.status, "draft")

    const line = await addJourneyLineCore(tx, {
      journeyId: journey.id,
      module: "activity",
      payload: { activityId: randomUUID() },
      priceTnd: 100,
    })
    assert.equal(line.status, "pending")

    const withLines = await getJourneyWithLinesCore(tx, { journeyId: journey.id })
    assert.equal(withLines?.journey.status, "ready")
    assert.equal(withLines?.lines.length, 1)
  })
})

test("addJourneyLineCore : refuse d'ajouter une ligne une fois la composition verrouillée (au moins une ligne processing/confirmed/failed)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "car", payload: {} })
    const cas = await casLineToProcessingCore(tx, { lineId: line.id })
    assert.equal(cas.outcome, "started")

    await assert.rejects(
      () => addJourneyLineCore(tx, { journeyId: journey.id, module: "car", payload: {} }),
      /JOURNEY_COMPOSITION_LOCKED/,
    )
  })
})

test("casLineToProcessingCore : idempotent — une ligne déjà 'processing' ne peut pas être re-déclenchée (double-clic)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "transfer", payload: {} })

    const first = await casLineToProcessingCore(tx, { lineId: line.id })
    assert.equal(first.outcome, "started")

    const second = await casLineToProcessingCore(tx, { lineId: line.id })
    assert.equal(second.outcome, "already_processing")
  })
})

test("casLineToProcessingCore : idempotent — une ligne déjà 'confirmed' retourne already_confirmed avec le reservationId existant, jamais une nouvelle exécution", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "network", payload: {} })
    await casLineToProcessingCore(tx, { lineId: line.id })
    // journey_lines.reservation_id référence réellement reservations.id (FK) —
    // jamais un id fabriqué : on insère une vraie ligne minimale, exactement
    // ce que ferait le vrai moteur de réservation avant de retourner son id
    // (voir journey-actions.ts::confirmJourneyLine, étape 2/3).
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId,
        customerId,
        publicRef: `JRN-TEST-${randomUUID().slice(0, 8)}`,
        module: "network",
        source: "internal",
        originalCurrency: "TND",
        originalAmount: "0",
        tndAmount: "0",
      })
      .returning({ id: reservations.id })
    const realReservationId = reservation!.id
    await recordLineOutcomeCore(tx, { lineId: line.id, outcome: { ok: true, reservationId: realReservationId } })

    const retry = await casLineToProcessingCore(tx, { lineId: line.id })
    assert.equal(retry.outcome, "already_confirmed")
    if (retry.outcome === "already_confirmed") {
      assert.equal(retry.line.reservationId, realReservationId)
    }
  })
})

test("recordLineOutcomeCore : échec -> ligne 'failed' + errorMessage, journey 'ready' redevient tentable (retry individuel)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "package", payload: {} })
    await casLineToProcessingCore(tx, { lineId: line.id })
    await recordLineOutcomeCore(tx, { lineId: line.id, outcome: { ok: false, error: "Solde insuffisant" } })

    const withLines = await getJourneyWithLinesCore(tx, { journeyId: journey.id })
    const failedLine = withLines?.lines.find((l) => l.id === line.id)
    assert.equal(failedLine?.status, "failed")
    assert.equal(failedLine?.errorMessage, "Solde insuffisant")
    assert.equal(withLines?.journey.status, "failed")

    // Retry individuel : failed -> processing autorisé
    const retryCas = await casLineToProcessingCore(tx, { lineId: line.id })
    assert.equal(retryCas.outcome, "started")
  })
})

test("recordLineOutcomeCore : jamais d'écrasement d'une ligne déjà 'confirmed' (idempotence défensive contre un double enregistrement)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "omra", payload: {} })
    await casLineToProcessingCore(tx, { lineId: line.id })
    const [firstReservation] = await tx
      .insert(reservations)
      .values({
        agencyId,
        customerId,
        publicRef: `JRN-TEST-${randomUUID().slice(0, 8)}`,
        module: "omra",
        source: "internal",
        originalCurrency: "TND",
        originalAmount: "0",
        tndAmount: "0",
      })
      .returning({ id: reservations.id })
    const firstReservationId = firstReservation!.id
    await recordLineOutcomeCore(tx, { lineId: line.id, outcome: { ok: true, reservationId: firstReservationId } })

    // Un second appel (ex. retry réseau du même résultat) ne doit jamais
    // écraser le reservationId réel — id d'une DEUXIÈME vraie réservation,
    // pour prouver que l'écrasement est bien refusé et non pas juste
    // silencieusement compatible avec un id fabriqué.
    const [secondReservation] = await tx
      .insert(reservations)
      .values({
        agencyId,
        customerId,
        publicRef: `JRN-TEST-${randomUUID().slice(0, 8)}`,
        module: "omra",
        source: "internal",
        originalCurrency: "TND",
        originalAmount: "0",
        tndAmount: "0",
      })
      .returning({ id: reservations.id })
    await recordLineOutcomeCore(tx, {
      lineId: line.id,
      outcome: { ok: true, reservationId: secondReservation!.id },
    })

    const withLines = await getJourneyWithLinesCore(tx, { journeyId: journey.id })
    const confirmedLine = withLines?.lines.find((l) => l.id === line.id)
    assert.equal(confirmedLine?.reservationId, firstReservationId)
  })
})

test("removeJourneyLineCore : refuse de supprimer une ligne confirmed (RULE FINANCIÈRE — jamais un rollback silencieux)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "hotel", payload: {} })
    await casLineToProcessingCore(tx, { lineId: line.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId,
        customerId,
        publicRef: `JRN-TEST-${randomUUID().slice(0, 8)}`,
        module: "hotel",
        source: "internal",
        originalCurrency: "TND",
        originalAmount: "0",
        tndAmount: "0",
      })
      .returning({ id: reservations.id })
    await recordLineOutcomeCore(tx, { lineId: line.id, outcome: { ok: true, reservationId: reservation!.id } })

    await assert.rejects(() => removeJourneyLineCore(tx, { lineId: line.id }), /LINE_NOT_REMOVABLE/)
  })
})

test("removeJourneyLineCore : une ligne pending reste supprimable", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  await withTenantContext({ agencyId, userId: randomUUID(), isSuperAdmin: false }, async (tx) => {
    const journey = await createJourneyCore(tx, { agencyId, createdByUserId: randomUUID() })
    const line = await addJourneyLineCore(tx, { journeyId: journey.id, module: "activity", payload: {} })
    await removeJourneyLineCore(tx, { lineId: line.id })
    const withLines = await getJourneyWithLinesCore(tx, { journeyId: journey.id })
    assert.equal(withLines?.lines.length, 0)
    assert.equal(withLines?.journey.status, "draft")
  })
})
