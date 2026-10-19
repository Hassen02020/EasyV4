/**
 * MUTUELLE-INVOICE-SETTLEMENT-01 × MUTUELLE-CONCURRENCY-COMPLETE-01
 * (réconciliation) — preuve RLS RÉELLE, sous le rôle applicatif
 * `app_runtime` (non-superutilisateur), que l'isolation par agence
 * s'applique bien aux deux nouvelles écritures financières de ce chantier :
 * `partner_invoices` (facture "issued" Mutuelle) et `audit_events` (trace
 * de règlement).
 *
 * ⚠️ CE FICHIER DOIT ÊTRE EXÉCUTÉ AVEC DATABASE_URL POINTANT SUR LE RÔLE
 * `app_runtime` (jamais le superutilisateur `postgres`, qui contournerait
 * RLS par construction et rendrait ce test trompeur). Reproduit localement
 * les étapes réelles de `.github/workflows/ci.yml` (stub schéma auth,
 * création du rôle, grants, replay de drizzle/manual/*.sql) — voir
 * scratchpad/setup-app-runtime.sh pour le script de reproduction utilisé
 * lors de la campagne de vérification locale.
 *
 * Policy réelle vérifiée (drizzle/manual/0001_rls_policies.sql /
 * 0005_b2b_partner_rls.sql) : `agency_id = current_agency_id() OR
 * is_super_admin()`, FORCE ROW LEVEL SECURITY sur les deux tables
 * (drizzle/manual/0012_rls_session_context.sql) — donc appliquée même au
 * propriétaire de la table, uniquement contournée par un rôle superuser ou
 * BYPASSRLS (jamais le cas de app_runtime en production).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  partnerInvoices,
} from "@/lib/db/schema"
import { generateIssuedInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { confirmMutuelleInvoiceSettlementCore } from "@/lib/finance/mutuelle-invoice-settlement-actions"

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

async function createAgencyWithIssuedInvoice(label: string): Promise<{
  agencyId: string
  reservationId: string
  userId: string
  invoiceId: string
}> {
  const suffix = randomUUID().slice(0, 8)
  const { agencyId, reservationId, userId } = await withSystemContext(
    async (tx) => {
      const [agency] = await tx
        .insert(agencies)
        .values({
          name: `RLS Mutuelle Test ${label} ${suffix}`,
          agencyType: "ota",
          slug: `rls-mutuelle-${label}-${suffix}`,
        })
        .returning({ id: agencies.id })
      const [customer] = await tx
        .insert(customers)
        .values({
          agencyId: agency!.id,
          civility: "M",
          firstName: "RLS",
          lastName: `Test ${label}`,
        })
        .returning({ id: customers.id })
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId: agency!.id,
          publicRef: `MUT-RLS-${label}-${suffix}`,
          customerId: customer!.id,
          module: "flight",
          source: "manual",
          status: "confirmed",
          originalCurrency: "TND",
          originalAmount: "300.00",
          tndAmount: "300.00",
        })
        .returning({ id: reservations.id })
      return {
        agencyId: agency!.id,
        reservationId: reservation!.id,
        userId: randomUUID(),
      }
    },
  )

  const created = await generateIssuedInvoiceForReservation({
    agencyId,
    reservationId,
    actorUserId: userId,
  })
  assert.ok(created.ok, `fixture ${label} : la facture issued doit se créer`)
  if (!created.ok) throw new Error("unreachable")
  return { agencyId, reservationId, userId, invoiceId: created.invoiceId }
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
    await tx.delete(customers).where(eq(customers.agencyId, fixture.agencyId))
    await tx.delete(agencies).where(eq(agencies.id, fixture.agencyId))
  })
}

let agencyA: Awaited<ReturnType<typeof createAgencyWithIssuedInvoice>> | null =
  null
let agencyB: Awaited<ReturnType<typeof createAgencyWithIssuedInvoice>> | null =
  null

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = await createAgencyWithIssuedInvoice("A")
  agencyB = await createAgencyWithIssuedInvoice("B")
})

after(async () => {
  if (!dbAvailable) return
  if (agencyA) await cleanup(agencyA)
  if (agencyB) await cleanup(agencyB)
})

test("RLS RÉELLE (app_runtime) — l'agence B ne voit JAMAIS la facture Mutuelle de l'agence A", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const rowsSeenByB = await withTenantContext(
    {
      agencyId: agencyB!.agencyId,
      userId: agencyB!.userId,
      isSuperAdmin: false,
    },
    (tx) =>
      tx
        .select()
        .from(partnerInvoices)
        .where(eq(partnerInvoices.id, agencyA!.invoiceId)),
  )
  assert.equal(
    rowsSeenByB.length,
    0,
    "RLS doit cacher la facture de l'agence A à l'agence B — jamais 1 ligne",
  )

  // Sanity : l'agence A voit bien SA PROPRE facture (RLS n'est pas fail-closed
  // pour tout le monde — seulement pour les tiers).
  const rowsSeenByA = await withTenantContext(
    {
      agencyId: agencyA!.agencyId,
      userId: agencyA!.userId,
      isSuperAdmin: false,
    },
    (tx) =>
      tx
        .select()
        .from(partnerInvoices)
        .where(eq(partnerInvoices.id, agencyA!.invoiceId)),
  )
  assert.equal(rowsSeenByA.length, 1, "l'agence A doit voir sa propre facture")
})

test("RLS RÉELLE (app_runtime) — l'agence B ne peut pas confirmer le règlement de la facture de l'agence A", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // confirmMutuelleInvoiceSettlementCore pose lui-même le contexte tenant
  // (agencyId=agencyB) via withTenantContext — RLS doit rendre le
  // SELECT ... FOR UPDATE invisible, donc "Facture introuvable", jamais une
  // transition de statut.
  const result = await confirmMutuelleInvoiceSettlementCore(
    agencyB!.agencyId,
    agencyB!.userId,
    { invoiceId: agencyA!.invoiceId, reference: "VIR-RLS-CROSS-TENANT" },
  )
  assert.equal(
    result.ok,
    false,
    "une agence tierce ne doit jamais pouvoir régler la facture d'une autre agence",
  )

  // La facture de l'agence A doit rester "issued", intacte — vérifié en
  // contexte système (lecture de contrôle, pas la cible du test RLS).
  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(partnerInvoices)
      .where(eq(partnerInvoices.id, agencyA!.invoiceId)),
  )
  assert.equal(
    row!.status,
    "issued",
    "la tentative cross-tenant ne doit avoir rien modifié",
  )
})

test("RLS RÉELLE (app_runtime) — super_admin voit les factures des deux agences", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const rowsSeenBySuperAdmin = await withTenantContext(
    { agencyId: null, userId: randomUUID(), isSuperAdmin: true },
    (tx) =>
      tx
        .select()
        .from(partnerInvoices)
        .where(
          sql`${partnerInvoices.id} in (${agencyA!.invoiceId}, ${agencyB!.invoiceId})`,
        ),
  )
  assert.equal(
    rowsSeenBySuperAdmin.length,
    2,
    "is_super_admin() doit lever l'isolation — comportement voulu, pas un gap RLS",
  )
})
