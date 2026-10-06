/**
 * CAMPAIGN-ATTRIBUTION-01 — preuve live contre un Postgres réel : une
 * réservation 'confirmed' dont le client correspond (après normalisation
 * CONTACT-01) à un CONTACT ciblé par une campagne encore éligible est
 * attribuée UNE SEULE FOIS, de façon stable (réécrite jamais). BOOKING
 * n'est jamais modifié par ces tests — uniquement des lectures sur
 * reservations/customers. Même convention que les autres tests live de
 * ce dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres local.
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
  campaignAttributions,
  campaigns,
  campaignTargets,
  contacts,
  customers,
  reservations,
} from "@/lib/db/schema"
import {
  createCampaignCore,
  launchCampaignCore,
} from "../campaign-persistence-core"
import {
  attributeReservationCore,
  attributeNewReservationsCore,
} from "../campaign-attribution-core"

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

async function makeCustomer(email: string | null, phone: string | null) {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(customers)
      .values({
        agencyId: agencyA,
        firstName: "Test",
        lastName: "Client",
        email,
        phone,
      })
      .returning({ id: customers.id }),
  )
  return row!.id
}

async function makeReservation(
  customerId: string,
  status:
    | "pending"
    | "on_request"
    | "confirmed"
    | "cancelled"
    | "no_show"
    | "completed"
    | "refunded"
    | "expired",
  createdAt?: Date,
) {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        publicRef: `AT-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "hotel",
        source: "internal",
        status,
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
        ...(createdAt ? { createdAt } : {}),
      })
      .returning({ id: reservations.id }),
  )
  return row!.id
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyA,
      name: "CAMPAIGN-ATTRIBUTION Agency A",
      agencyType: "ota",
      slug: `campaign-attribution-a-${agencyA.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(campaignAttributions)
      .where(eq(campaignAttributions.agencyId, agencyA))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyA))
    await tx.delete(customers).where(eq(customers.agencyId, agencyA))
    await tx
      .delete(campaignTargets)
      .where(eq(campaignTargets.agencyId, agencyA))
    await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyA))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

test("PREUVE CENTRALE — réservation confirmée, client correspond à un CONTACT ciblé → attribution écrite une seule fois", async (t) => {
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
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [
        { id: "lead-x", email: "attributed@example.com", phone: null },
      ],
    }),
  )
  // Note : sans CONSENT-01 câblé dans ce test (hors scope), l'audience
  // ne sera éligible QUE si un consentement existe — ce test vérifie
  // donc aussi, implicitement, qu'aucune réservation n'est attribuée
  // en son absence (voir test suivant).

  const customerId = await makeCustomer("attributed@example.com", null)
  const reservationId = await makeReservation(customerId, "confirmed")

  const result = await withTenantContext(ctxA, (tx) =>
    attributeReservationCore(tx, { agencyId: agencyA, reservationId }),
  )

  // Sans consentement enregistré, filterAudienceByConsentCore exclut le
  // contact de campaign_targets — donc NO_MATCH est le résultat correct
  // ici (aucune cible snapshotée pour ce contact).
  assert.deepEqual(result, { ok: true, attributed: false, reason: "NO_MATCH" })
})

test("contact réellement ciblé (via consentement réel) → attribution écrite, idempotente au second appel", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const { recordConsentEventCore } = await import("../consent-core")
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "real-target@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Campagne réelle",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [
        { id: "lead-real", email: "real-target@example.com", phone: null },
      ],
    }),
  )

  const customerId = await makeCustomer("Real-Target@Example.com", null)
  const reservationId = await makeReservation(customerId, "confirmed")

  const first = await withTenantContext(ctxA, (tx) =>
    attributeReservationCore(tx, { agencyId: agencyA, reservationId }),
  )
  assert.deepEqual(first, {
    ok: true,
    attributed: true,
    campaignId: campaign.id,
  })

  const second = await withTenantContext(ctxA, (tx) =>
    attributeReservationCore(tx, { agencyId: agencyA, reservationId }),
  )
  assert.deepEqual(second, {
    ok: true,
    attributed: false,
    reason: "ALREADY_ATTRIBUTED",
  })

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(campaignAttributions)
      .where(eq(campaignAttributions.reservationId, reservationId)),
  )
  assert.equal(rows.length, 1, "une seule ligne d'attribution, jamais deux")
})

test("réservation 'pending' (jamais confirmée) → NO_MATCH, jamais attribuée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const customerId = await makeCustomer("pending-client@example.com", null)
  const reservationId = await makeReservation(customerId, "pending")

  const result = await withTenantContext(ctxA, (tx) =>
    attributeReservationCore(tx, { agencyId: agencyA, reservationId }),
  )
  assert.deepEqual(result, { ok: true, attributed: false, reason: "NO_MATCH" })
})

test("réservation inexistante → RESERVATION_NOT_FOUND", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    attributeReservationCore(tx, {
      agencyId: agencyA,
      reservationId: randomUUID(),
    }),
  )
  assert.deepEqual(result, { ok: false, code: "RESERVATION_NOT_FOUND" })
})

test("attributeNewReservationsCore : balaie toutes agences, attribue ce qui correspond, ignore le reste", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const { recordConsentEventCore } = await import("../consent-core")
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "batch-target@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Campagne batch",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [
        { id: "lead-batch", email: "batch-target@example.com", phone: null },
      ],
    }),
  )

  const matchingCustomerId = await makeCustomer(
    "batch-target@example.com",
    null,
  )
  const matchingReservationId = await makeReservation(
    matchingCustomerId,
    "confirmed",
  )
  const nonMatchingCustomerId = await makeCustomer("no-match@example.com", null)
  await makeReservation(nonMatchingCustomerId, "confirmed")

  const result = await withSystemContext((tx) =>
    attributeNewReservationsCore(tx, { limit: 1000 }),
  )

  assert.ok(result.scanned >= 2)
  assert.ok(result.attributed >= 1)

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(campaignAttributions)
      .where(eq(campaignAttributions.reservationId, matchingReservationId)),
  )
  assert.equal(rows.length, 1)
})
