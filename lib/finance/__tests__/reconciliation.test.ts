/**
 * Réconciliation financière — preuve live contre un Postgres réel, même
 * convention que lib/admin/__tests__/inventory-locks-core.test.ts : se
 * dégrade en `skip` sans DATABASE_URL/Postgres local disponible. Chaque
 * test crée ses propres fixtures (agence dédiée par randomUUID) pour ne
 * jamais interférer avec les autres tests ou données réelles.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  payments,
  pspWebhooks,
  partnerCreditMovements,
  auditEvents,
} from "@/lib/db/schema"
import { runPaymentReconciliation, RECONCILIATION_LOCK_KEY } from "../reconciliation"

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

async function makeReservation(overrides: Partial<typeof reservations.$inferInsert> = {}) {
  return withSystemContext(async (tx) => {
    const [r] = await tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `RC-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "hotel",
        source: "internal",
        status: "pending",
        originalCurrency: "TND",
        originalAmount: "100.00",
        tndAmount: "100.00",
        ...overrides,
      })
      .returning({ id: reservations.id })
    return r!.id
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId = randomUUID()
  customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      name: "RECONCILIATION Test Agency",
      agencyType: "ota",
      slug: `reconciliation-test-${agencyId.slice(0, 8)}`,
      depositBalance: "500.000",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Reconciliation",
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyId))
    await tx.delete(payments).where(eq(payments.agencyId, agencyId))
    await tx.delete(pspWebhooks).where(eq(pspWebhooks.agencyId, agencyId))
    await tx.delete(partnerCreditMovements).where(eq(partnerCreditMovements.agencyId, agencyId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("runPaymentReconciliation : webhook en erreur récent => orphaned_webhook", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    await tx.insert(pspWebhooks).values({
      agencyId,
      psp: "paymee",
      eventType: "payment.succeeded",
      payload: { test: true },
      signatureOk: true,
      error: "NO_MATCHING_PAYMENT",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter((f) => f.check === "orphaned_webhook" && f.agencyId === agencyId)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.details.error, "NO_MATCHING_PAYMENT")
})

test("runPaymentReconciliation : paiement carte pending au-delà du délai => stuck_pending_payment", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({
    status: "pending",
    paymentExpiresAt: new Date(Date.now() - 20 * 60 * 1000), // expiré depuis 20 min > grâce 15 min
  })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "pending",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "stuck_pending_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 1)
})

test("runPaymentReconciliation : paiement carte pending dans la fenêtre de grâce => pas encore signalé", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({
    status: "pending",
    paymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // pas encore expiré
  })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "pending",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "stuck_pending_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 0, "ne doit jamais signaler un paiement encore dans sa fenêtre de règlement")
})

test("runPaymentReconciliation : réservation confirmée sans paiement capturé => confirmed_without_payment", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({ status: "confirmed", confirmedAt: new Date() })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "confirmed_without_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 1)
})

test("runPaymentReconciliation : réservation confirmée AVEC paiement capturé => pas signalée", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const reservationId = await makeReservation({ status: "confirmed", confirmedAt: new Date() })
  await withSystemContext(async (tx) => {
    await tx.insert(payments).values({
      agencyId,
      reservationId,
      psp: "paymee",
      method: "card",
      originalCurrency: "TND",
      originalAmount: "100.00",
      tndAmount: "100.00",
      status: "captured",
      capturedAt: new Date(),
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter(
    (f) => f.check === "confirmed_without_payment" && f.details.reservationId === reservationId,
  )
  assert.equal(found.length, 0)
})

test("runPaymentReconciliation : solde agence != dernier mouvement grand livre => wallet_ledger_drift", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    // balance_after (600) volontairement différent de agencies.deposit_balance (500 posé au before())
    // — simule une dérive de tenue de compte.
    await tx.insert(partnerCreditMovements).values({
      agencyId,
      movementType: "credit",
      amount: "600.000",
      balanceAfter: "600.000",
      description: "Test drift fixture",
    })
  })

  const { findings } = await runPaymentReconciliation()
  const found = findings.filter((f) => f.check === "wallet_ledger_drift" && f.agencyId === agencyId)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.details.storedBalance, "500.000")
  assert.equal(found[0]!.details.lastLedgerBalance, "600.000")
})

test("runPaymentReconciliation : journalise chaque écart dans audit_events", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    await tx.insert(pspWebhooks).values({
      agencyId,
      psp: "paymee",
      eventType: "payment.succeeded",
      payload: { test: true },
      signatureOk: true,
      error: "AUDIT_TEST_MARKER",
    })
  })

  await runPaymentReconciliation()

  const rows = await withSystemContext((tx) =>
    tx
      .select({ action: auditEvents.action, entityType: auditEvents.entityType })
      .from(auditEvents)
      .where(eq(auditEvents.agencyId, agencyId)),
  )
  assert.ok(rows.some((r) => r.entityType === "reconciliation" && r.action === "orphaned_webhook"))
})

test("runPaymentReconciliation : IDEMPOTENCE — le même écart détecté deux fois ne journalise jamais deux lignes", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const [webhook] = await withSystemContext((tx) =>
    tx
      .insert(pspWebhooks)
      .values({
        agencyId,
        psp: "paymee",
        eventType: "payment.succeeded",
        payload: { test: true },
        signatureOk: true,
        error: "IDEMPOTENCE_TEST_MARKER",
      })
      .returning({ id: pspWebhooks.id }),
  )

  // Deux passages séquentiels détectent tous les deux ce même webhook
  // (jamais supprimé entre les deux appels) — le deuxième insert doit être
  // absorbé par ON CONFLICT ... DO NOTHING, pas créer une deuxième ligne.
  await runPaymentReconciliation()
  await runPaymentReconciliation()

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "reconciliation"),
          eq(auditEvents.entityId, webhook!.id),
          eq(auditEvents.action, "orphaned_webhook"),
        ),
      ),
  )
  assert.equal(rows.length, 1, "une seule ligne audit_events pour ce webhook, malgré deux détections")
})

test("runPaymentReconciliation : CONCURRENCE — le verrou déjà tenu par une autre transaction fait céder l'exécution immédiatement", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Deux appels réels en Promise.all seraient trop rapides (~15ms chacun)
  // pour garantir un chevauchement fiable — plutôt que de dépendre du
  // timing, on tient nous-mêmes le MÊME verrou depuis une transaction
  // séparée, maintenue ouverte jusqu'à ce qu'on la libère explicitement,
  // et on vérifie qu'un appel réel pendant ce temps cède bien (skipped=true).
  let releaseHeldLock: () => void = () => {}
  let onLockAcquired: () => void = () => {}
  const lockAcquired = new Promise<void>((resolve) => {
    onLockAcquired = resolve
  })

  const holderPromise = withSystemContext(async (tx) => {
    const [{ locked }] = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${RECONCILIATION_LOCK_KEY}) as locked`,
    )) as Array<{ locked: boolean }>
    assert.equal(locked, true, "setup : doit pouvoir acquérir le verrou en premier")
    onLockAcquired()
    await new Promise<void>((resolve) => {
      releaseHeldLock = resolve
    })
  })

  try {
    await lockAcquired
    const result = await runPaymentReconciliation()
    assert.equal(
      result.skipped,
      true,
      "une exécution qui trouve le verrou déjà tenu doit céder immédiatement, jamais attendre ni vérifier en double",
    )
    assert.deepEqual(result.findings, [], "aucun contrôle exécuté quand le verrou est cédé")
  } finally {
    releaseHeldLock()
    await holderPromise
  }
})

test("runPaymentReconciliation : DÉTERMINISME — wallet_ledger_drift stable entre deux passages sur les mêmes données", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const sameTimestamp = new Date("2026-01-01T00:00:00.000Z")
  await withSystemContext(async (tx) => {
    // Deux mouvements au MÊME created_at exact (égalité forcée) — sans
    // tiebreaker déterministe, le choix du "dernier" mouvement pourrait
    // flapper entre deux exécutions sur des données identiques.
    await tx.insert(partnerCreditMovements).values([
      {
        agencyId,
        movementType: "credit",
        amount: "700.000",
        balanceAfter: "700.000",
        description: "Determinism test A",
        createdAt: sameTimestamp,
      },
      {
        agencyId,
        movementType: "adjustment",
        amount: "-1.000",
        balanceAfter: "699.000",
        description: "Determinism test B",
        createdAt: sameTimestamp,
      },
    ])
  })

  const first = await runPaymentReconciliation()
  const second = await runPaymentReconciliation()
  const pick = (r: typeof first) =>
    r.findings.find((f) => f.check === "wallet_ledger_drift" && f.agencyId === agencyId)?.details.lastLedgerBalance

  assert.equal(pick(first), pick(second), "le même mouvement doit être choisi comme \"dernier\" à chaque passage")
})

test("runPaymentReconciliation : webhook orphelin sans agence explicite (agency_id=null) se rattache à l'agence OTA par défaut, jamais silencieusement perdu", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const [webhook] = await withSystemContext((tx) =>
    tx
      .insert(pspWebhooks)
      .values({
        agencyId: null,
        psp: "paymee",
        eventType: "payment.succeeded",
        payload: { test: true },
        signatureOk: true,
        error: "NO_MATCHING_PAYMENT",
      })
      .returning({ id: pspWebhooks.id }),
  )

  try {
    const { findings, unresolvedAgencyWarnings } = await runPaymentReconciliation()
    const found = findings.find((f) => f.check === "orphaned_webhook" && f.entityId === webhook!.id)
    // Une agence OTA par défaut existe dans cet environnement de test —
    // le webhook doit lui être rattaché, jamais disparaître silencieusement.
    assert.ok(found, "le webhook agency_id=null doit être rattaché à l'agence OTA par défaut, pas disparaître")
    assert.equal(unresolvedAgencyWarnings, 0)
  } finally {
    // agency_id=null (webhook) + son audit_events (rattaché à l'agence OTA
    // par défaut, pas au fixture) ne sont pas couverts par le after() du
    // fichier (filtré sur agencyId du fixture) — nettoyage direct des deux.
    await withSystemContext(async (tx) => {
      await tx
        .delete(auditEvents)
        .where(
          and(
            eq(auditEvents.entityType, "reconciliation"),
            eq(auditEvents.entityId, webhook!.id),
            eq(auditEvents.action, "orphaned_webhook"),
          ),
        )
      await tx.delete(pspWebhooks).where(eq(pspWebhooks.id, webhook!.id))
    })
  }
})
