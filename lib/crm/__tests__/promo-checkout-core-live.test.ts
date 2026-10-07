/**
 * PROMO-CHECKOUT-CONTEXT-01 — preuve live contre un Postgres réel : un
 * `campaignId` transporté par le client n'est jamais une preuve
 * d'éligibilité — seul un contact RÉELLEMENT dans `campaign_targets`
 * (donc réellement consentant au lancement) débloque la promo. Même
 * convention que les autres tests live de ce dépôt : se dégrade en
 * `skip` sans DATABASE_URL/Postgres local disponible.
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
  contacts,
  leadConsentEvents,
  promos,
} from "@/lib/db/schema"
import { recordConsentEventCore } from "../consent-core"
import {
  createCampaignCore,
  launchCampaignCore,
} from "../campaign-persistence-core"
import { createPromoCore } from "../promo-core"
import { resolveCheckoutPromoCore } from "../promo-checkout-core"

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
      name: "PROMO-CHECKOUT Agency A",
      agencyType: "ota",
      slug: `promo-checkout-a-${agencyA.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(promos).where(eq(promos.agencyId, agencyA))
    await tx
      .delete(campaignTargets)
      .where(eq(campaignTargets.agencyId, agencyA))
    await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyA))
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyA))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

async function setupEligibleCampaignWithPromo(ctxA: TenantContext) {
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "checkout-real@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Checkout Promo",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "percent",
      discountValue: "30.00",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [
        {
          id: "lead-checkout",
          email: "checkout-real@example.com",
          phone: null,
        },
      ],
    }),
  )
  return campaign
}

test("PREUVE CENTRALE — client réellement ciblé et consentant → éligible, remise résolue", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const campaign = await setupEligibleCampaignWithPromo(ctxA)

  const result = await withTenantContext(ctxA, (tx) =>
    resolveCheckoutPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      email: "Checkout-Real@Example.com",
      phone: null,
    }),
  )

  assert.equal(result.eligible, true)
  if (result.eligible) {
    assert.equal(result.discount.applicable, true)
  }
})

test("campaignId fabriqué/inexistant → CAMPAIGN_NOT_FOUND, jamais une remise accordée par défaut", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    resolveCheckoutPromoCore(tx, {
      agencyId: agencyA,
      campaignId: randomUUID(),
      email: "anyone@example.com",
      phone: null,
    }),
  )
  assert.deepEqual(result, { eligible: false, reason: "CAMPAIGN_NOT_FOUND" })
})

test("campaignId réel transporté, mais CE client n'est pas dans campaign_targets → NOT_TARGETED (la valeur transportée ne donne jamais rien par elle-même)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const campaign = await setupEligibleCampaignWithPromo(ctxA)

  const result = await withTenantContext(ctxA, (tx) =>
    resolveCheckoutPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      email: "not-the-targeted-contact@example.com",
      phone: null,
    }),
  )
  assert.deepEqual(result, { eligible: false, reason: "NOT_TARGETED" })
})

test("campagne encore 'draft' (jamais lancée) → CAMPAIGN_NOT_ACTIVE", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Jamais lancée",
      channel: "email",
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    resolveCheckoutPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      email: "anyone@example.com",
      phone: null,
    }),
  )
  assert.deepEqual(result, { eligible: false, reason: "CAMPAIGN_NOT_ACTIVE" })
})

test("campagne active mais sans promo créée → NO_PROMO", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "no-promo@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Sans promo",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [{ id: "lead-np", email: "no-promo@example.com", phone: null }],
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    resolveCheckoutPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      email: "no-promo@example.com",
      phone: null,
    }),
  )
  assert.deepEqual(result, { eligible: false, reason: "NO_PROMO" })
})
