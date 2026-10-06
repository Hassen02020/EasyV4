/**
 * PROMO-01 — preuve live contre un Postgres réel : une promo ne peut
 * être créée/éditée que pour une campagne encore 'draft', le pointeur
 * `campaigns.promoRef` est réellement posé, 1 promo par campagne
 * (unique), aucune écriture dans reservations/economic_entitlements.
 * Même convention que les autres tests live de ce dépôt : se dégrade
 * en `skip` sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, campaigns, promos } from "@/lib/db/schema"
import {
  createCampaignCore,
  launchCampaignCore,
  getCampaignCore,
} from "../campaign-persistence-core"
import {
  createPromoCore,
  updatePromoCore,
  getPromoForCampaignCore,
} from "../promo-core"

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
      name: "PROMO Agency A",
      agencyType: "ota",
      slug: `promo-a-${agencyA.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(promos).where(eq(promos.agencyId, agencyA))
    await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
  })
})

test("createPromoCore : campagne 'draft' → promo créée, campaigns.promoRef posé réellement", async (t) => {
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

  const result = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "fixed",
      discountValue: "50.00",
    }),
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  const reloaded = await withTenantContext(ctxA, (tx) =>
    getCampaignCore(tx, { agencyId: agencyA, campaignId: campaign.id }),
  )
  assert.equal(
    reloaded!.promoRef,
    result.promo.id,
    "campaigns.promoRef doit pointer vers la promo créée",
  )
})

test("createPromoCore : campagne inexistante → CAMPAIGN_NOT_FOUND", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: randomUUID(),
      discountType: "percent",
      discountValue: "10.00",
    }),
  )
  assert.deepEqual(result, { ok: false, code: "CAMPAIGN_NOT_FOUND" })
})

test("createPromoCore : campagne déjà lancée → CAMPAIGN_NOT_DRAFT, jamais de promo créée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Déjà lancée",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [],
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "percent",
      discountValue: "15.00",
    }),
  )
  assert.deepEqual(result, { ok: false, code: "CAMPAIGN_NOT_DRAFT" })
})

test("createPromoCore : type de remise invalide → INVALID_DISCOUNT_TYPE", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Type invalide",
      channel: "email",
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "buy_one_get_one",
      discountValue: "1",
    }),
  )
  assert.deepEqual(result, { ok: false, code: "INVALID_DISCOUNT_TYPE" })
})

test("createPromoCore : une campagne ne peut avoir qu'une seule promo (ALREADY_HAS_PROMO)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Une seule promo",
      channel: "email",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "fixed",
      discountValue: "50.00",
    }),
  )

  const second = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "percent",
      discountValue: "10.00",
    }),
  )
  assert.deepEqual(second, { ok: false, code: "ALREADY_HAS_PROMO" })
})

test("updatePromoCore : modifiable en 'draft', refusée après lancement (CAMPAIGN_NOT_DRAFT)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Édition promo",
      channel: "email",
    }),
  )
  const created = await withTenantContext(ctxA, (tx) =>
    createPromoCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      discountType: "fixed",
      discountValue: "30.00",
    }),
  )
  assert.equal(created.ok, true)
  if (!created.ok) return

  const updated = await withTenantContext(ctxA, (tx) =>
    updatePromoCore(tx, {
      agencyId: agencyA,
      promoId: created.promo.id,
      discountValue: "40.00",
    }),
  )
  assert.equal(updated.ok, true)
  if (updated.ok) assert.equal(updated.promo.discountValue, "40.00")

  await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [],
    }),
  )

  const refused = await withTenantContext(ctxA, (tx) =>
    updatePromoCore(tx, {
      agencyId: agencyA,
      promoId: created.promo.id,
      discountValue: "999.00",
    }),
  )
  assert.deepEqual(refused, { ok: false, code: "CAMPAIGN_NOT_DRAFT" })

  const reloaded = await withTenantContext(ctxA, (tx) =>
    getPromoForCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )
  assert.equal(
    reloaded!.discountValue,
    "40.00",
    "la valeur n'a pas changé malgré le refus",
  )
})

test("PROMO-01 ne touche jamais reservations/economic_entitlements, ni contacts/lead_consent_events directement", () => {
  const src = readFileSync(join(process.cwd(), "lib/crm/promo-core.ts"), "utf8")
  // Preuve négative sur les imports/accès réels — pas sur la prose des
  // commentaires, qui nomme ces tables pour expliquer pourquoi elles ne
  // sont PAS importées.
  assert.equal(/^import [^\n]*\breservations\b/m.test(src), false)
  assert.equal(/^import [^\n]*\beconomicEntitlements\b/m.test(src), false)
  assert.equal(/^import [^\n]*\bcontacts\b/m.test(src), false)
  assert.equal(/^import [^\n]*\bleadConsentEvents\b/m.test(src), false)
})
