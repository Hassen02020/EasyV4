/**
 * CAMPAIGN-PERSISTENCE-01 — preuve live contre un Postgres réel : le
 * snapshot de cible n'est pris QU'AU LANCEMENT, jamais à la création,
 * délègue réellement à CAMPAIGN-01 (donc à CONTACT-01/CONSENT-01), et
 * une campagne déjà lancée refuse un second lancement. Même convention
 * que les autres tests live de ce dépôt : se dégrade en `skip` sans
 * DATABASE_URL/Postgres local disponible.
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
} from "@/lib/db/schema"
import { recordConsentEventCore } from "../consent-core"
import {
  createCampaignCore,
  launchCampaignCore,
  listCampaignTargetsCore,
  getCampaignCore,
  updateCampaignCore,
} from "../campaign-persistence-core"

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

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyA,
      name: "CAMPAIGN-PERSISTENCE Agency A",
      agencyType: "ota",
      slug: `campaign-persistence-a-${agencyA.slice(0, 8)}`,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
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

test("createCampaignCore : statut 'draft', AUCUNE cible enregistrée", async (t) => {
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
      objective: "Relancer les demandes Istanbul de novembre",
      channel: "email",
    }),
  )

  assert.equal(campaign.status, "draft")

  const targets = await withTenantContext(ctxA, (tx) =>
    listCampaignTargetsCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )
  assert.equal(targets.length, 0, "aucune cible avant le lancement")
})

test("launchCampaignCore : PREUVE CENTRALE — 3 LEADs → 2 CONTACTs → 1 cible snapshotée, statut → active", async (t) => {
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
      contactRef: "launch-proof@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  // other-contact@example.com n'a volontairement aucun événement.

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Lancement preuve",
      channel: "email",
    }),
  )

  const launch = await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [
        { id: "lead-l1", email: "Launch-Proof@Example.com", phone: null },
        { id: "lead-l2", email: "LAUNCH-PROOF@EXAMPLE.COM", phone: null },
        { id: "lead-l3", email: "other-contact@example.com", phone: null },
      ],
    }),
  )

  assert.deepEqual(launch, { ok: true, targetCount: 1 })

  const targets = await withTenantContext(ctxA, (tx) =>
    listCampaignTargetsCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )
  assert.equal(targets.length, 1, "seul le CONTACT éligible est snapshoté")
  assert.equal(targets[0]!.consentStatusAtSnapshot, true)
  assert.deepEqual(
    new Set(targets[0]!.leadIds),
    new Set(["lead-l1", "lead-l2"]),
  )

  const reloaded = await withTenantContext(ctxA, (tx) =>
    getCampaignCore(tx, { agencyId: agencyA, campaignId: campaign.id }),
  )
  assert.equal(reloaded!.status, "active")
})

test("launchCampaignCore : une campagne déjà lancée refuse un second lancement (jamais un second snapshot silencieux)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Double lancement",
      channel: "email",
    }),
  )

  const first = await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [{ id: "lead-d1", email: "double@example.com", phone: null }],
    }),
  )
  assert.equal(first.ok, true)

  const second = await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      audience: [{ id: "lead-d2", email: "double@example.com", phone: null }],
    }),
  )
  assert.deepEqual(second, { ok: false, code: "ALREADY_LAUNCHED" })

  const targets = await withTenantContext(ctxA, (tx) =>
    listCampaignTargetsCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
    }),
  )
  assert.equal(targets.length, 1, "le second appel n'a rien ajouté")
})

test("launchCampaignCore : campagne inexistante → CAMPAIGN_NOT_FOUND", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    launchCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: randomUUID(),
      audience: [],
    }),
  )
  assert.deepEqual(result, { ok: false, code: "CAMPAIGN_NOT_FOUND" })
})

test("updateCampaignCore : en 'draft', name/objective/channel/message/startAt/endAt tous modifiables", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Brouillon initial",
      channel: "email",
    }),
  )

  const startAt = new Date("2026-11-01T00:00:00Z")
  const endAt = new Date("2026-11-30T00:00:00Z")
  const result = await withTenantContext(ctxA, (tx) =>
    updateCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      name: "Istanbul Novembre",
      objective: "Relancer les demandes Istanbul",
      message: "Profitez de -50 TND sur votre séjour à Istanbul",
      startAt,
      endAt,
    }),
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.campaign.name, "Istanbul Novembre")
    assert.equal(
      result.campaign.message,
      "Profitez de -50 TND sur votre séjour à Istanbul",
    )
    assert.equal(result.campaign.startAt?.getTime(), startAt.getTime())
    assert.equal(result.campaign.endAt?.getTime(), endAt.getTime())
  }
})

test("updateCampaignCore : après lancement, name/objective/channel/message REFUSÉS (CAMPAIGN_NOT_DRAFT) — une nouvelle version exige une nouvelle campagne", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Figée après lancement",
      message: "Message original",
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

  const refused = await withTenantContext(ctxA, (tx) =>
    updateCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      message: "Nouveau message après lancement",
    }),
  )
  assert.deepEqual(refused, { ok: false, code: "CAMPAIGN_NOT_DRAFT" })

  const reloaded = await withTenantContext(ctxA, (tx) =>
    getCampaignCore(tx, { agencyId: agencyA, campaignId: campaign.id }),
  )
  assert.equal(
    reloaded!.message,
    "Message original",
    "le message n'a pas changé malgré le refus",
  )
})

test("updateCampaignCore : après lancement, startAt/endAt restent modifiables (un planning s'ajuste)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const campaign = await withTenantContext(ctxA, (tx) =>
    createCampaignCore(tx, {
      agencyId: agencyA,
      name: "Planning ajustable",
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

  const newEndAt = new Date("2026-12-15T00:00:00Z")
  const result = await withTenantContext(ctxA, (tx) =>
    updateCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: campaign.id,
      endAt: newEndAt,
    }),
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.campaign.endAt?.getTime(), newEndAt.getTime())
  }
})

test("updateCampaignCore : campagne inexistante → CAMPAIGN_NOT_FOUND", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    updateCampaignCore(tx, {
      agencyId: agencyA,
      campaignId: randomUUID(),
      name: "x",
    }),
  )
  assert.deepEqual(result, { ok: false, code: "CAMPAIGN_NOT_FOUND" })
})
