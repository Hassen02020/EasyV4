/**
 * CAMPAIGN-PERFORMANCE-01 — preuve live contre un Postgres réel :
 * `exposed`/`converted` comptent les lignes réelles de
 * `campaign_targets`/`campaign_attributions`, et `revenueTnd`/
 * `marginTnd` sont des sommes RÉELLES lues depuis
 * `reservationFinancials` (FINANCIAL) — jamais un second calcul,
 * jamais une valeur inventée. Même convention que les autres tests
 * live de ce dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres
 * local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import {
  agencies,
  campaigns,
  campaignTargets,
  campaignAttributions,
  contacts,
  customers,
  reservations,
} from "@/lib/db/schema"
import { reservationFinancials } from "@/lib/db/schema/financials"
import { createCampaignCore } from "../campaign-persistence-core"
import { getCampaignPerformanceCore } from "../campaign-performance-core"

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
  "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure."

let agencyA = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyA,
      name: "CAMPAIGN-PERFORMANCE Agency A",
      agencyType: "ota",
      slug: `campaign-performance-a-${agencyA.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(reservationFinancials)
      .where(
        sql`${reservationFinancials.reservationId} in (select id from ${reservations} where agency_id = ${agencyA})`,
      )
    await tx
      .delete(campaignAttributions)
      .where(eq(campaignAttributions.agencyId, agencyA))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx
      .delete(campaignTargets)
      .where(eq(campaignTargets.agencyId, agencyA))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyA))
    await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

async function makeContact(channel: "email", contactRef: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(contacts)
      .values({ agencyId: agencyA, channel, contactRef })
      .returning({ id: contacts.id }),
  )
  return row!.id
}

async function makeCustomerAndReservation(amountTnd: string) {
  const [customer] = await withSystemContext((tx) =>
    tx
      .insert(customers)
      .values({
        agencyId: agencyA,
        firstName: "Test",
        lastName: "Client",
        email: "perf@example.com",
      })
      .returning({ id: customers.id }),
  )
  const [reservation] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        publicRef: `PERF-${randomUUID().slice(0, 8)}`,
        customerId: customer!.id,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: amountTnd,
        tndAmount: amountTnd,
      })
      .returning({ id: reservations.id }),
  )
  return reservation!.id
}

test("PREUVE CENTRALE — exposed/converted/revenueTnd/marginTnd reflètent des lignes réelles, jamais inventées", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Istanbul Novembre",
      channel: "email",
    }),
  )

  // 3 contacts exposés (campaign_targets) — seuls 2 convertissent.
  const contact1 = await makeContact("email", "exposed-1@example.com")
  const contact2 = await makeContact("email", "exposed-2@example.com")
  const contact3 = await makeContact("email", "exposed-3@example.com")

  await withSystemContext((tx) =>
    tx.insert(campaignTargets).values([
      {
        campaignId: campaign.id,
        agencyId: agencyA,
        contactId: contact1,
        leadIds: ["lead-1"],
        consentStatusAtSnapshot: true,
      },
      {
        campaignId: campaign.id,
        agencyId: agencyA,
        contactId: contact2,
        leadIds: ["lead-2"],
        consentStatusAtSnapshot: true,
      },
      {
        campaignId: campaign.id,
        agencyId: agencyA,
        contactId: contact3,
        leadIds: ["lead-3"],
        consentStatusAtSnapshot: true,
      },
    ]),
  )

  // 2 réservations réellement attribuées, avec de vraies lignes financières.
  const reservation1 = await makeCustomerAndReservation("500.00")
  await withSystemContext((tx) =>
    tx.insert(reservationFinancials).values({
      reservationId: reservation1,
      supplierPrice: "400.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "400.00",
      salePrice: "500.00",
      saleCurrency: "TND",
      salePriceTnd: "500.00",
      marginAmount: "100.00",
      marginPercent: "25.00",
    }),
  )

  const reservation2 = await makeCustomerAndReservation("300.00")
  await withSystemContext((tx) =>
    tx.insert(reservationFinancials).values({
      reservationId: reservation2,
      supplierPrice: "250.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "250.00",
      salePrice: "300.00",
      saleCurrency: "TND",
      salePriceTnd: "300.00",
      marginAmount: "50.00",
      marginPercent: "20.00",
    }),
  )

  await withSystemContext((tx) =>
    tx.insert(campaignAttributions).values([
      {
        campaignId: campaign.id,
        agencyId: agencyA,
        contactId: contact1,
        reservationId: reservation1,
      },
      {
        campaignId: campaign.id,
        agencyId: agencyA,
        contactId: contact2,
        reservationId: reservation2,
      },
    ]),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    getCampaignPerformanceCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )

  assert.deepEqual(result, {
    campaignId: campaign.id,
    exposed: 3,
    converted: 2,
    revenueTnd: "800.00",
    marginTnd: "150.00",
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    totalTargets: 0,
  })
})

test("PROMO-CAMPAIGN-CANCEL-01 — réservation attribuée puis annulée (cancelledAt set) → exclue de converted/revenueTnd/marginTnd", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Annulation Test",
      channel: "email",
    }),
  )

  const contact = await makeContact("email", "cancel-perf@example.com")

  await withSystemContext((tx) =>
    tx.insert(campaignTargets).values({
      campaignId: campaign.id,
      agencyId: agencyA,
      contactId: contact,
      leadIds: ["lead-cancel"],
      consentStatusAtSnapshot: true,
    }),
  )

  const reservationId = await makeCustomerAndReservation("400.00")

  await withSystemContext((tx) =>
    tx.insert(reservationFinancials).values({
      reservationId,
      supplierPrice: "300.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "300.00",
      salePrice: "400.00",
      saleCurrency: "TND",
      salePriceTnd: "400.00",
      marginAmount: "100.00",
      marginPercent: "25.00",
      cancellationFee: "0.00",
      refundAmount: "400.00",
      cancelledAt: new Date(),
    }),
  )

  await withSystemContext((tx) =>
    tx.insert(campaignAttributions).values({
      campaignId: campaign.id,
      agencyId: agencyA,
      contactId: contact,
      reservationId,
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    getCampaignPerformanceCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )

  assert.strictEqual(
    result.converted,
    0,
    "une réservation annulée ne doit pas compter comme conversion",
  )
  assert.strictEqual(
    result.revenueTnd,
    "0.00",
    "revenueTnd doit exclure les réservations annulées",
  )
  assert.strictEqual(
    result.marginTnd,
    "0.00",
    "marginTnd doit exclure les réservations annulées",
  )
})

test("campagne sans aucune cible ni attribution → tout à zéro, jamais une erreur", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Vide",
      channel: "email",
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    getCampaignPerformanceCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )

  assert.deepEqual(result, {
    campaignId: campaign.id,
    exposed: 0,
    converted: 0,
    revenueTnd: "0.00",
    marginTnd: "0.00",
  })
})
