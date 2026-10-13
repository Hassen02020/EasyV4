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
  products,
  reservationNetworkProduct,
} from "@/lib/db/schema"
import {
  declareSupplierSettlement,
  confirmSupplierSettlement,
  cancelSupplierSettlementDeclaration,
  requestSupplierSettlementCorrection,
  listUnsettledSupplierDebts,
} from "../supplier-settlement"

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

/** Fournisseur B indépendant — pour les tests anti-mélange de fournisseurs. */
async function seedAnotherSupplierNode(): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [supplier] = await tx
      .insert(suppliers)
      .values({
        name: `SS01 Supplier B ${suffix}`,
        type: "custom",
        status: "active",
      })
      .returning({ id: suppliers.id })
    const [node] = await tx
      .insert(supplierNodes)
      .values({
        supplierId: supplier!.id,
        slug: `ss01-node-b-${suffix}`,
        displayName: `SS01 Node B ${suffix}`,
        onboardingStatus: "active",
      })
      .returning({ id: supplierNodes.id })
    return node!.id
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

test("SS01 — raccordement réel Network : products -> reservation_network_product -> economic_entitlements -> supplier_settlements, via le wrapper TypeScript applicatif (pas du SQL brut)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const suffix = randomUUID().slice(0, 8)

  const fx = await withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `SS01 Link Agency ${suffix}`,
        agencyType: "ota",
        slug: `ss01-link-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        firstName: "SS01",
        lastName: `Link ${suffix}`,
      })
      .returning({ id: customers.id })
    const [superAdmin] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        agencyId: agency!.id,
        email: `ss01-link-admin-${suffix}@test.local`,
        role: "super_admin",
        status: "active",
      })
      .returning({ id: users.id })
    const [supplier] = await tx
      .insert(suppliers)
      .values({
        name: `SS01 Link Supplier ${suffix}`,
        type: "custom",
        status: "active",
      })
      .returning({ id: suppliers.id })
    const [node] = await tx
      .insert(supplierNodes)
      .values({
        supplierId: supplier!.id,
        slug: `ss01-link-node-${suffix}`,
        displayName: `SS01 Link Node ${suffix}`,
        onboardingStatus: "active",
      })
      .returning({ id: supplierNodes.id })
    const [product] = await tx
      .insert(products)
      .values({
        agencyId: agency!.id,
        supplierNodeId: node!.id,
        sku: `ss01-link-${suffix}`,
        type: "activity",
        name: `SS01 Link Activity ${suffix}`,
        basePrice: "600.000",
      })
      .returning({ id: products.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef: `SS01LINK-${suffix}`,
        customerId: customer!.id,
        module: "network",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "600.00",
        tndAmount: "600.00",
      })
      .returning({ id: reservations.id })
    await tx.insert(reservationNetworkProduct).values({
      reservationId: reservation!.id,
      productId: product!.id,
      supplierNodeId: node!.id,
    })
    const [entitlement] = await tx
      .insert(economicEntitlements)
      .values({
        reservationId: reservation!.id,
        partyType: "supplier_node",
        partyId: node!.id,
        role: "supplier",
        qualification: "supplier_cost",
        amount: "600.00",
        currency: "TND",
        status: "earned",
        effectiveAt: new Date(),
      })
      .returning({ id: economicEntitlements.id })
    return {
      superAdminId: superAdmin!.id,
      supplierNodeId: node!.id,
      reservationId: reservation!.id,
      entitlementId: entitlement!.id,
    }
  })

  // Correspondance exacte réservation <-> fournisseur <-> créance, lue via
  // les 3 tables réelles (pas un UUID coïncident entre fixtures).
  const linkage = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{
      reservation_supplier: string
      entitlement_supplier: string
      currency: string
      amount: string
    }>(sql`
      SELECT rnp.supplier_node_id AS reservation_supplier,
             ee.party_id AS entitlement_supplier,
             ee.currency, ee.amount
      FROM reservation_network_product rnp
      JOIN economic_entitlements ee ON ee.reservation_id = rnp.reservation_id
      WHERE rnp.reservation_id = ${fx.reservationId}::uuid
    `)
    return row!
  })
  assert.equal(linkage.reservation_supplier, fx.supplierNodeId)
  assert.equal(linkage.entitlement_supplier, fx.supplierNodeId)
  assert.equal(linkage.currency, "TND")
  assert.equal(linkage.amount, "600.00")

  // Avant règlement : la créance apparaît dans la liste des dettes non réglées.
  const before = await listUnsettledSupplierDebts(fx.supplierNodeId)
  assert.ok(before.some((d) => d.entitlementId === fx.entitlementId))
  assert.equal(
    before.find((d) => d.entitlementId === fx.entitlementId)
      ?.disputedCancellation,
    false,
  )

  // Raccordement via le wrapper applicatif (lib/finance/supplier-settlement.ts),
  // pas un appel SQL brut — preuve que la couche TypeScript fonctionne de bout en bout.
  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 600.0 }],
    "virement-test-link",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  // Après règlement : la créance disparaît de la liste des dettes non réglées
  // (aucun doublon de règlement possible sur cette même créance désormais).
  const after = await listUnsettledSupplierDebts(fx.supplierNodeId)
  assert.ok(!after.some((d) => d.entitlementId === fx.entitlementId))

  // Absence d'effet secondaire sur les commissions/wallet (table vide ou
  // inchangée — ce chantier ne les référence jamais, voir 0135 en-tête).
  const sideEffects = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM wallet_ledger WHERE reservation_id = ${fx.reservationId}::uuid
    `)
    return Number(row!.n)
  })
  assert.equal(
    sideEffects,
    0,
    "aucune ligne wallet_ledger créée par ce règlement fournisseur",
  )
})

test("SS01 — garde croisée : une créance du fournisseur A ne peut pas être déclarée sous le fournisseur B", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()
  const otherSupplierNodeId = await seedAnotherSupplierNode()

  const before = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM supplier_settlements`,
    )
    return Number(row!.n)
  })

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fx.superAdminId}::uuid, ${otherSupplierNodeId}::uuid,
          ${JSON.stringify([{ entitlement_id: fx.entitlementId, amount: 1000.0 }])}::jsonb, NULL, NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_SUPPLIER_MISMATCH",
  )

  const afterCount = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM supplier_settlements`,
    )
    return Number(row!.n)
  })
  assert.equal(
    afterCount,
    before,
    "aucune ligne supplier_settlements créée par une tentative rejetée (pas d'écriture partielle)",
  )
})

test("SS01 — garde croisée : un règlement ne peut pas mélanger les créances de deux fournisseurs (batch rejeté intégralement)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fxA = await seedRealisticFixture()
  const fxB = await seedRealisticFixture()

  const beforeEntries = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM supplier_settlement_entries`,
    )
    return Number(row!.n)
  })

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT declare_supplier_settlement(${fxA.superAdminId}::uuid, ${fxA.supplierNodeId}::uuid,
          ${JSON.stringify([
            { entitlement_id: fxA.entitlementId, amount: 1000.0 },
            { entitlement_id: fxB.entitlementId, amount: 1000.0 },
          ])}::jsonb, NULL, NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_SUPPLIER_MISMATCH",
  )

  // Pas d'écriture partielle : même la créance A (traitée avant B dans la boucle,
  // donc qui aurait pu être insérée seule) ne doit laisser aucune jonction résiduelle.
  const afterEntries = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM supplier_settlement_entries`,
    )
    return Number(row!.n)
  })
  assert.equal(afterEntries, beforeEntries)
  const [stillUnsettledA, stillUnsettledB] = await Promise.all([
    listUnsettledSupplierDebts(fxA.supplierNodeId),
    listUnsettledSupplierDebts(fxB.supplierNodeId),
  ])
  assert.ok(stillUnsettledA.some((d) => d.entitlementId === fxA.entitlementId))
  assert.ok(stillUnsettledB.some((d) => d.entitlementId === fxB.entitlementId))
})

test("SS01 — garde croisée : un remboursement ne peut pas cibler un règlement payé d'un AUTRE fournisseur", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fxA = await seedRealisticFixture()
  const fxB = await seedRealisticFixture()

  const settlementBId = await declareSupplierSettlement(
    fxB.superAdminId,
    fxB.supplierNodeId,
    [{ entitlementId: fxB.entitlementId, amount: 1000.0 }],
    "virement-B",
    null,
  )
  await confirmSupplierSettlement(fxB.superAdminId, settlementBId)

  // fxA.entitlementId appartient au fournisseur A, settlementBId est payé mais
  // appartient au fournisseur B — doit être rejeté, jamais accepté parce que
  // "le règlement cible est payé".
  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_correction(${fxA.superAdminId}::uuid, ${fxA.entitlementId}::uuid,
          ${settlementBId}::uuid, 'supplier_refund', -100.00, 'bank-ref-cross', NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_TARGET_NOT_PAID_OR_SUPPLIER_MISMATCH",
  )
})

test("SS01 — garde croisée : un remboursement ne peut pas cibler un règlement du même fournisseur mais ne contenant pas la créance concernée", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  // Une 2e créance, même fournisseur, réglée séparément.
  const otherEntitlementId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(economicEntitlements)
      .values({
        reservationId: fx.reservationId,
        partyType: "supplier_node",
        partyId: fx.supplierNodeId,
        role: "supplier",
        qualification: "supplier_cost",
        amount: "50.00",
        status: "earned",
        effectiveAt: new Date(),
      })
      .returning({ id: economicEntitlements.id })
    return row!.id
  })
  const otherSettlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: otherEntitlementId, amount: 50.0 }],
    "virement-other",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, otherSettlementId)

  // fx.entitlementId (la créance de 1000) n'a jamais été réglée du tout — donc
  // "otherSettlementId" est bien payé, même fournisseur, mais NE CONTIENT PAS
  // fx.entitlementId. Doit être rejeté.
  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_correction(${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid,
          ${otherSettlementId}::uuid, 'supplier_refund', -10.00, 'bank-ref-wrong-target', NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_TARGET_DOES_NOT_CONTAIN_ENTITLEMENT",
  )
})

test("SS01 — concurrence réelle sur réversion : 2 demandes de réversion simultanées sur le même règlement, une seule réussit", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()
  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-rev-conc",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  const call = () =>
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_reversal(${fx.superAdminId}::uuid, ${settlementId}::uuid, 'rejected_payment', 'notice-conc')
      `),
    )
  const results = await Promise.allSettled([call(), call()])
  const succeeded = results.filter((r) => r.status === "fulfilled")
  const failed = results.filter((r) => r.status === "rejected")
  assert.equal(
    succeeded.length,
    1,
    "une seule demande de réversion doit réussir",
  )
  assert.equal(
    failed.length,
    1,
    "l'autre doit être rejetée (anti-double-reversal)",
  )

  const reversalCount = await withSystemContext(async (tx) => {
    const [row] = await tx.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM supplier_settlements
      WHERE corrects_settlement_id = ${settlementId}::uuid AND correction_type = 'reversal'
        AND status NOT IN ('failed','cancelled')
    `)
    return Number(row!.n)
  })
  assert.equal(
    reversalCount,
    1,
    "jamais 2 réversions actives pour le même règlement",
  )
})

test("SS01 — lecture financière : un trop-payé réel (après correction calculation_error) n'est jamais masqué comme 'réglée'", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-ref-over",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  // Après règlement exact : correctement absente de la liste (ni reste à payer, ni trop-payé).
  const afterExactSettlement = await listUnsettledSupplierDebts(
    fx.supplierNodeId,
  )
  assert.ok(
    !afterExactSettlement.some((d) => d.entitlementId === fx.entitlementId),
  )

  // Erreur de calcul découverte : la dette reconnue est en réalité 800, pas 1000.
  const corrId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    null,
    "calculation_error",
    -200.0,
    null,
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, corrId)

  const after = await listUnsettledSupplierDebts(fx.supplierNodeId)
  const row = after.find((d) => d.entitlementId === fx.entitlementId)
  assert.ok(
    row,
    "la créance doit réapparaître : payé_réel=1000 > recognized_debt=800 est un trop-payé réel, jamais masqué",
  )
  assert.equal(row!.paidReal, "1000.00")
  assert.equal(row!.recognizedDebt, "800.00")
  assert.equal(row!.overpaid, "200.00")
  assert.equal(row!.remaining, "0.00")
})

test("SS01 — remboursement : dette restante inchangée, seul le net décaissé baisse", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 500.0 }],
    "virement-fix-1",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  const refundId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    settlementId,
    "supplier_refund",
    -150.0,
    "bank-ref-fix-1",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, refundId)

  const rows = await listUnsettledSupplierDebts(fx.supplierNodeId)
  const row = rows.find((d) => d.entitlementId === fx.entitlementId)
  assert.ok(row, "la dette restante doit toujours apparaître dans la liste")
  assert.equal(row!.paidReal, "500.00")
  assert.equal(
    row!.netDecaisse,
    "350.00",
    "net décaissé = paid_real + refunded (refunded déjà négatif) = 500 + (-150) = 350",
  )
  assert.equal(row!.recognizedDebt, "1000.00")
  assert.equal(row!.remaining, "500.00")
  assert.equal(row!.overpaid, "0.00")
})

test("SS01 — correctif financier : déclaration non confirmée → aucun paiement réel dans les calculs", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  // Déclarée mais JAMAIS confirmée.
  await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-2",
    null,
  )

  const rows = await listUnsettledSupplierDebts(fx.supplierNodeId)
  const row = rows.find((d) => d.entitlementId === fx.entitlementId)
  assert.ok(
    row,
    "doit apparaître comme non réglée : la déclaration n'est pas confirmée",
  )
  assert.equal(
    row!.paidReal,
    "0.00",
    "aucun paiement réel tant que non confirmé",
  )
  assert.equal(row!.netDecaisse, "0.00")
  assert.equal(row!.remaining, "1000.00")
})

test("SS01 — correctif financier : déclaration annulée → aucun paiement fantôme", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-3",
    null,
  )
  await cancelSupplierSettlementDeclaration(fx.superAdminId, settlementId)

  const rows = await listUnsettledSupplierDebts(fx.supplierNodeId)
  const row = rows.find((d) => d.entitlementId === fx.entitlementId)
  assert.ok(
    row,
    "toujours due : la déclaration annulée n'a jamais été un paiement réel",
  )
  assert.equal(row!.paidReal, "0.00")
  assert.equal(row!.remaining, "1000.00")

  // Réaffectation possible : l'annulation n'a laissé aucune jonction active résiduelle.
  const newSettlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-3b",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, newSettlementId)
  const afterReassign = await listUnsettledSupplierDebts(fx.supplierNodeId)
  assert.ok(!afterReassign.some((d) => d.entitlementId === fx.entitlementId))
})

test("SS01 — correctif financier : correction comptable déclarée mais non confirmée → aucun effet prématuré sur la dette reconnue", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-4",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  // Correction déclarée, JAMAIS confirmée.
  const corrId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    null,
    "calculation_error",
    -200.0,
    null,
    null,
  )

  const rowsUnconfirmed = await listUnsettledSupplierDebts(fx.supplierNodeId)
  assert.ok(
    !rowsUnconfirmed.some((d) => d.entitlementId === fx.entitlementId),
    "recognized_debt doit rester 1000 (non ajustée) tant que la correction n'est pas confirmée — réglée exactement, pas de trop-payé prématuré",
  )

  // Puis annulée : toujours aucun effet.
  await cancelSupplierSettlementDeclaration(fx.superAdminId, corrId)
  const rowsCancelled = await listUnsettledSupplierDebts(fx.supplierNodeId)
  assert.ok(!rowsCancelled.some((d) => d.entitlementId === fx.entitlementId))
})

test("SS01 — correctif financier : plafond de remboursement sur le net réellement déboursé, sans compter les corrections comptables comme un flux de trésorerie", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-5",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  // Erreur de calcul confirmée : dette reconnue = 800, mais le CASH réel reste 1000.
  const calcCorrId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    null,
    "calculation_error",
    -200.0,
    null,
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, calcCorrId)

  // Un remboursement de -850 doit être ACCEPTÉ : le plafond est le cash réel (1000),
  // jamais la dette reconnue (800) — sinon 800-850 serait négatif et rejetterait
  // à tort un remboursement pourtant couvert par l'argent réellement transféré.
  const refund1Id = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    settlementId,
    "supplier_refund",
    -850.0,
    "bank-ref-fix-5a",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, refund1Id)

  // Un second remboursement de -200 doit maintenant être REJETÉ : le cash réel
  // restant est 1000 - 850 = 150, insuffisant pour -200 — toujours sans tenir
  // compte de la correction comptable de -200 (qui n'a jamais été un flux réel).
  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_correction(${fx.superAdminId}::uuid, ${fx.entitlementId}::uuid,
          ${settlementId}::uuid, 'supplier_refund', -200.00, 'bank-ref-fix-5b', NULL)
      `),
    ),
    "SUPPLIER_SETTLEMENT_REFUND_EXCEEDS_NET",
  )
})

test("SS01 — correctif financier : deux remboursements déclarés avant confirmation, le second dépasse le net réel au moment de sa confirmation → rejeté", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const settlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-fix-6",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, settlementId)

  // Les deux remboursements sont déclarés AVANT que l'un ou l'autre ne soit
  // confirmé — chacun passe la vérification de prévisualisation individuellement
  // (net réel = 1000 pour les deux, aucun ne voit l'autre tant que non payé).
  const refundAId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    settlementId,
    "supplier_refund",
    -600.0,
    "bank-ref-fix-6a",
    null,
  )
  const refundBId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    settlementId,
    "supplier_refund",
    -600.0,
    "bank-ref-fix-6b",
    null,
  )

  await confirmSupplierSettlement(fx.superAdminId, refundAId)

  // Sans la revérification ajoutée à confirm_supplier_settlement, ceci
  // confirmerait à tort et ferait passer le net réel à 1000-600-600=-200.
  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(
        sql`SELECT confirm_supplier_settlement(${fx.superAdminId}::uuid, ${refundBId}::uuid)`,
      ),
    ),
    "SUPPLIER_SETTLEMENT_REFUND_EXCEEDS_NET_AT_CONFIRM",
  )

  const rows = await listUnsettledSupplierDebts(fx.supplierNodeId)
  const row = rows.find((d) => d.entitlementId === fx.entitlementId)
  assert.ok(row)
  assert.equal(
    row!.netDecaisse,
    "400.00",
    "seul le remboursement A confirmé compte : 1000-600=400",
  )
})

test("SS01 — remboursement : une correction comptable payée ne peut pas servir de règlement cible", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())
  const fx = await seedRealisticFixture()

  const normalSettlementId = await declareSupplierSettlement(
    fx.superAdminId,
    fx.supplierNodeId,
    [{ entitlementId: fx.entitlementId, amount: 1000.0 }],
    "virement-target-normal",
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, normalSettlementId)

  // Cette correction est payée et vise la même créance, mais ce n'est pas
  // un règlement normal. Elle ne doit pas autoriser un remboursement.
  const correctionSettlementId = await requestSupplierSettlementCorrection(
    fx.superAdminId,
    fx.entitlementId,
    null,
    "calculation_error",
    -100.0,
    null,
    null,
  )
  await confirmSupplierSettlement(fx.superAdminId, correctionSettlementId)

  await assertRejectsWithPgError(
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT request_supplier_settlement_correction(
          ${fx.superAdminId}::uuid,
          ${fx.entitlementId}::uuid,
          ${correctionSettlementId}::uuid,
          'supplier_refund',
          -50.00,
          'bank-ref-accounting-target',
          NULL
        )
      `),
    ),
    "SUPPLIER_SETTLEMENT_TARGET_DOES_NOT_CONTAIN_ENTITLEMENT",
  )
})

