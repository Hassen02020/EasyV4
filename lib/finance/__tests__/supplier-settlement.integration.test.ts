/**
 * SUPPLIER-SETTLEMENT-01 — preuve d'intégration RÉELLE (PostgreSQL vivant)
 * pour les 5 fonctions `SECURITY DEFINER` de `drizzle/manual/0135_supplier_settlement_01.sql`.
 *
 * Même convention `isDbAvailable()` que
 * `lib/finance/__tests__/commission-reversal-integration.test.ts` — se `skip`-ent
 * proprement sans `DATABASE_URL`, exécutent réellement sinon, contre la base
 * locale provisionnée par la CI (db:push + replay `drizzle/manual/*.sql`),
 * jamais contre une base partagée ou de production.
 *
 * PÉRIMÈTRE VÉRIFIÉ (pas supposé) contre le dépôt réel : `qualification='supplier_cost'`
 * n'a PAS un sens unique selon le module (voir en-tête de 0135). Ce mécanisme
 * ne couvre QUE `party_type='supplier_node'` (module Network) — les fixtures
 * ci-dessous utilisent délibérément un vrai couple `suppliers`/`supplier_nodes`,
 * jamais un UUID de fournisseur inventé.
 *
 * LIMITE CONNUE DE CE FICHIER EN CI (documentée, pas cachée) : l'étape CI
 * "Grants finaux app_runtime" (.github/workflows/ci.yml) ré-accorde
 * INSERT/UPDATE/DELETE à `app_runtime` sur TOUTES les tables APRÈS le replay
 * des migrations — donc APRÈS le REVOKE de 0135. L'assertion "app_runtime ne
 * peut pas écrire directement sur supplier_settlement_entries" a été prouvée
 * manuellement contre une base locale reproduisant fidèlement les seuls
 * GRANTs de 0135 (sans cette étape CI), mais n'est PAS incluse ici car elle
 * donnerait un résultat trompeur (faux positif local, non garanti par la CI
 * telle que configurée aujourd'hui). Seules les assertions non affectées par
 * cette étape (REVOKE EXECUTE anon/authenticated sur les fonctions, jamais
 * élargi par ce step qui ne porte que sur des GRANT de TABLE à app_runtime)
 * sont testées ici. Ce même écart affecte déjà, à l'identique et avant ce
 * chantier, 0084/0092 (REVOKE UPDATE/DELETE sur wallet_ledger/economic_entitlements
 * pour app_runtime) — pas une régression introduite ici, un gap CI préexistant
 * à traiter séparément si jugé prioritaire.
 */
import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  economicEntitlements,
  users,
  supplierNodes,
  suppliers,
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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir drizzle/manual/0135_supplier_settlement_01.sql"

/**
 * `assert.rejects` contre une erreur postgres-js ne doit jamais tester
 * `err.message` (qui ne contient que "Failed query: ...") mais `err.cause.message`
 * — même pattern que `commission-reversal-integration.test.ts`.
 */
async function assertRejectsWithPgError(
  promise: Promise<unknown>,
  expectedSubstring: string,
): Promise<void> {
  await assert.rejects(promise, (err) => {
    const causeMessage = (err as { cause?: { message?: string } })?.cause
      ?.message
    assert.ok(
      causeMessage?.includes(expectedSubstring),
      `attendu "${expectedSubstring}" sur cause.message, reçu: ${causeMessage}`,
    )
    return true
  })
}

/**
 * Crée un jeu de données réaliste : agence + client + super_admin réel +
 * fournisseur réel (suppliers -> supplier_nodes, PAS un UUID inventé) +
 * une réservation active avec un entitlement `supplier_cost`/`supplier_node`.
 */
async function seedRealisticFixture(): Promise<{
  agencyId: string
  superAdminId: string
  supplierNodeId: string
  reservationId: string
  entitlementId: string
}> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `SS01 Test Agency ${suffix}`,
        agencyType: "ota",
        slug: `ss01-test-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        firstName: "SS01",
        lastName: `Customer ${suffix}`,
      })
      .returning({ id: customers.id })
    const [superAdmin] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        agencyId: agency!.id,
        email: `ss01-superadmin-${suffix}@test.local`,
        role: "super_admin",
        status: "active",
      })
      .returning({ id: users.id })
    const [supplier] = await tx
      .insert(suppliers)
      .values({
        name: `SS01 Supplier ${suffix}`,
        type: "custom",
        status: "active",
      })
      .returning({ id: suppliers.id })
    const [node] = await tx
      .insert(supplierNodes)
      .values({
        supplierId: supplier!.id,
        slug: `ss01-node-${suffix}`,
        displayName: `SS01 Node ${suffix}`,
        onboardingStatus: "active",
      })
      .returning({ id: supplierNodes.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `SS01-${suffix}`,
        customerId: customer!.id,
        module: "network",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "1000.00",
        tndAmount: "1000.00",
      })
      .returning({ id: reservations.id })
    const [entitlement] = await tx
      .insert(economicEntitlements)
      .values({
        reservationId: reservation!.id,
        partyType: "supplier_node",
        partyId: node!.id,
        role: "supplier",
        qualification: "supplier_cost",
        amount: "1000.00",
        status: "earned",
        effectiveAt: new Date(),
      })
      .returning({ id: economicEntitlements.id })
    return {
      agencyId: agency!.id,
      superAdminId: superAdmin!.id,
      supplierNodeId: node!.id,
      reservationId: reservation!.id,
      entitlementId: entitlement!.id,
    }
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
})

test("SS01 — règlement normal puis remboursement réel : net_décaissé baisse, due() reste à 0", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ declare_supplier_settlement: string }>(sql`
      SELECT declare_supplier_settlement(
        ${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
        ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1000.0 }])}::jsonb,
        'virement-ref', NULL
      ) AS declare_supplier_settlement
    `)
    return row!.declare_supplier_settlement
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${settlementId}::uuid)`,
    ),
  )

  const refundId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{
      request_supplier_settlement_correction: string
    }>(sql`
      SELECT request_supplier_settlement_correction(
        ${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid, ${settlementId}::uuid,
        'supplier_refund', -150.00, 'bank-ref-1', NULL
      ) AS request_supplier_settlement_correction
    `)
    return row!.request_supplier_settlement_correction
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${refundId}::uuid)`,
    ),
  )

  const net = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ net: string }>(sql`
      SELECT COALESCE(SUM(amount), 0) AS net FROM supplier_settlement_entries
      WHERE entitlement_id = ${fx.entitlementId}::uuid AND unlinked_at IS NULL
    `)
    return Number(row!.net)
  })
  assert.equal(net, 850)
})

test("SS01 — réversion : cascade sélective (remboursement réel cascadé, correction calc_error jamais touchée)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ declare_supplier_settlement: string }>(sql`
      SELECT declare_supplier_settlement(
        ${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
        ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1000.0 }])}::jsonb,
        'virement-ref', NULL
      ) AS declare_supplier_settlement
    `)
    return row!.declare_supplier_settlement
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${settlementId}::uuid)`,
    ),
  )

  const calcCorrId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT request_supplier_settlement_correction(
        ${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid, NULL,
        'calculation_error', -100.00, NULL, NULL
      ) AS id
    `)
    return row!.id
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${calcCorrId}::uuid)`,
    ),
  )

  const refundId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT request_supplier_settlement_correction(
        ${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid, ${settlementId}::uuid,
        'supplier_refund', -50.00, 'bank-ref-2', NULL
      ) AS id
    `)
    return row!.id
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${refundId}::uuid)`,
    ),
  )

  const reversalId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT request_supplier_settlement_reversal(
        ${fx.superAdminId}::uuid, ${settlementId}::uuid, 'rejected_payment', 'notice-1'
      ) AS id
    `)
    return row!.id
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${reversalId}::uuid)`,
    ),
  )

  const statuses = await withSystemContext(async (tx) => {
    const rows = await tx.execute<{ id: string; status: string }>(sql`
      SELECT id, status FROM supplier_settlements WHERE id IN (${calcCorrId}::uuid, ${refundId}::uuid)
    `)
    return Object.fromEntries(rows.map((r) => [r.id, r.status]))
  })
  assert.equal(
    statuses[calcCorrId],
    "paid",
    "correction calculation_error jamais cascadée",
  )
  assert.equal(
    statuses[refundId],
    "reversed",
    "remboursement réel chaîné cascadé",
  )
})

test("SS01 — acteur falsifié (non super_admin ou inexistant) rejeté même avec EXECUTE accordé", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()
  const fakeActor = randomUUID()

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fakeActor}::uuid, ${fx.supplierNodeId}::uuid,
          ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1.0 }])}::jsonb, NULL, NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_ACTOR_NOT_SUPER_ADMIN",
  )
})

test("SS01 — party_type non supporté (ex. agency — coût de flotte, pas une dette tierce) rejeté", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const agencyPartyEntitlementId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(economicEntitlements)
      .values({
        reservationId: fx.reservationId,
        partyType: "agency",
        partyId: fx.agencyId,
        role: "product_owner",
        qualification: "supplier_cost",
        amount: "200.00",
        status: "earned",
        effectiveAt: new Date(),
      })
      .returning({ id: economicEntitlements.id })
    return row!.id
  })

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${fx.agencyId}::uuid,
          ${JSON.stringify([{ entitlement_id: agencyPartyEntitlementId, amount: 200.0 }])}::jsonb, NULL, NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_UNSUPPORTED_PARTY_TYPE",
  )
})

test("SS01 — réservation annulée : déclaration sans note rejetée, avec note acceptée", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()
  await withSystemContext((tx) =>
    tx
      .update(reservations)
      .set({ status: "cancelled" })
      .where(eq(reservations.id, fx.reservationId)),
  )

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
          ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1000.0 }])}::jsonb, NULL, NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_REVIEW_NOTE_REQUIRED",
  )

  const settlementId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
        ${JSON.stringify([
          {
            entitlement_id: fx.entitlementId,
            amount: 1000.0,
            cancellation_review_note:
              "Vérifié avec le fournisseur, contrat non-remboursable.",
          },
        ])}::jsonb, NULL, NULL) AS id
    `)
    return row!.id
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${settlementId}::uuid)`,
    ),
  )
  const status = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ status: string }>(
      sql`SELECT status FROM supplier_settlements WHERE id = ${settlementId}::uuid`,
    )
    return row!.status
  })
  assert.equal(status, "paid")
})

test("SS01 — remboursement supérieur au net disponible rejeté (jamais de net négatif)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()
  const settlementId = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
        ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 500.0 }])}::jsonb, NULL, NULL) AS id
    `)
    return row!.id
  })
  await withSystemContext((tx) =>
    tx.execute(
      sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${settlementId}::uuid)`,
    ),
  )

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_correction(${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid,
          ${settlementId}::uuid, 'supplier_refund', -900.00, 'bank-ref-over', NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_REFUND_EXCEEDS_NET",
  )
})

test("SS01 — concurrence réelle : 2 déclarations simultanées sur la même créance, une seule réussit", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const call = () =>
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${fx.supplierNodeId}::uuid,
          ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1000.0 }])}::jsonb, NULL, NULL)
      `),
    )

  const results = await Promise.allSettled([call(), call()])
  const succeeded = results.filter((r) => r.status === "fulfilled")
  const failed = results.filter((r) => r.status === "rejected")
  assert.equal(succeeded.length, 1, "une seule déclaration doit réussir")
  assert.equal(failed.length, 1, "l'autre doit être rejetée (ALREADY_ACTIVE)")

  const activeCount = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM supplier_settlement_entries
      WHERE entitlement_id = ${fx.entitlementId}::uuid AND unlinked_at IS NULL
    `)
    return Number(row!.n)
  })
  assert.equal(
    activeCount,
    1,
    "jamais 2 jonctions actives pour la même créance",
  )
})

// Pas de test ici pour "EXECUTE refusé à anon/authenticated" : la connexion
// applicative (`DATABASE_URL` = app_runtime, non-superuser) ne peut PAS faire
// `SET ROLE authenticated` (confirmé : "permission denied to set role
// authenticated" — app_runtime n'est membre d'aucun des deux, par construction).
// C'est le comportement de sécurité ATTENDU, pas une lacune de ce fichier — mais
// cela signifie que cette assertion ne peut être reproduite QUE par une connexion
// superuser (comme `postgres`), hors de ce harnais de test applicatif. Preuve déjà
// faite manuellement ce chantier (role réel, connexion postgres superuser,
// "permission denied for function declare_supplier_settlement" / "for table
// supplier_settlement_entries") — voir rapport du chantier, non reproductible ici
// sans élargir le harnais de test à une connexion superuser dédiée (hors périmètre
// de cette étape).
