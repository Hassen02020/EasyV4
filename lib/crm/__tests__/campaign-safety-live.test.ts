/**
 * CRM-CAMPAIGN-SAFETY-01 — preuve live (PostgreSQL réel, rôle app_runtime en
 * CI) de la livraison de campagne sûre : seul l'envoi Resend est simulé.
 *
 * Couvre les écarts G-01 (droit UPDATE sur campaign_targets), G-06 (campagne
 * annulée), G-07 (reprise sans doublon), G-08/G-10 (désinscription) et G-36
 * (cas « succès » jamais testé) de docs/crm/CRM_CARTOGRAPHY.md.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
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
import type { SendCampaignEmailInput } from "@/lib/email/send-campaign-email"
import {
  recordConsentEventCore,
  hasMarketingConsentCore,
} from "../consent-core"
import {
  createCampaignCore,
  launchCampaignCore,
  cancelCampaignCore,
} from "../campaign-persistence-core"
import {
  deliverCampaignCore,
  markRemainingTargetsFailedCore,
  campaignEmailIdempotencyKey,
} from "../campaign-delivery-core"
import { unsubscribeCampaignTargetCore } from "../campaign-unsubscribe-core"

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

let agencyId = ""
const SITE = "https://example.test"

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      name: "CRM-CAMPAIGN-SAFETY-01 agence test",
      agencyType: "ota",
      slug: `campaign-safety-${agencyId.slice(0, 8)}`,
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx
      .delete(campaignTargets)
      .where(eq(campaignTargets.agencyId, agencyId))
    await tx.delete(campaigns).where(eq(campaigns.agencyId, agencyId))
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyId))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

/** Contexte de la livraison réelle (deliver-campaign.ts) : RLS active. */
const deliveryCtx = (): TenantContext => ({
  agencyId,
  userId: "",
  isSuperAdmin: false,
})
const runTx = <T>(fn: Parameters<typeof withTenantContext<T>>[1]) =>
  withTenantContext(deliveryCtx(), fn)

/** Campagne email lancée vers des adresses ayant toutes consenti. */
async function launchedCampaign(emails: string[]): Promise<string> {
  const ctx: TenantContext = { agencyId, userId: "", isSuperAdmin: false }
  for (const email of emails) {
    await withTenantContext(ctx, (tx) =>
      recordConsentEventCore(tx, {
        agencyId,
        channel: "email",
        contactRef: email,
        purpose: "marketing",
        action: "granted",
        source: "test",
      }),
    )
  }
  const campaign = await withTenantContext(ctx, (tx) =>
    createCampaignCore(tx, {
      agencyId,
      name: "Campagne test",
      channel: "email",
      message: "Bonjour",
    }),
  )
  const launch = await withTenantContext(ctx, (tx) =>
    launchCampaignCore(tx, {
      agencyId,
      campaignId: campaign.id,
      audience: emails.map((email, i) => ({
        id: `lead-${i}`,
        email,
        phone: null,
      })),
    }),
  )
  assert.deepEqual(launch, { ok: true, targetCount: emails.length })
  return campaign.id
}

async function statuses(campaignId: string): Promise<string[]> {
  const rows = await withSystemContext((tx) =>
    tx
      .select({ s: campaignTargets.deliveryStatus })
      .from(campaignTargets)
      .where(eq(campaignTargets.campaignId, campaignId)),
  )
  return rows.map((r) => r.s ?? "").sort()
}

function recorder(failFor: Set<string> = new Set()) {
  const sent: SendCampaignEmailInput[] = []
  return {
    sent,
    sendEmail: async (input: SendCampaignEmailInput) => {
      if (failFor.has(input.to)) throw new Error("resend 500")
      sent.push(input)
    },
  }
}

const uniq = (p: string) => `${p}-${randomUUID().slice(0, 8)}@example.com`

test("G-01/G-36 : envoi réussi enregistré 'sent' sous app_runtime, avec lien de désinscription et clé d'idempotence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const a = uniq("ok-a")
  const b = uniq("ok-b")
  const campaignId = await launchedCampaign([a, b])
  const r = recorder()

  const result = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: r.sendEmail, siteUrl: SITE },
  )

  assert.equal(result.sent, 2)
  assert.equal(result.failed, 0)
  assert.deepEqual(await statuses(campaignId), ["sent", "sent"])
  for (const mail of r.sent) {
    assert.match(
      mail.unsubscribeUrl,
      /^https:\/\/example\.test\/fr\/desabonnement\/[0-9a-f-]{36}$/,
    )
    assert.match(
      mail.oneClickUnsubscribeUrl,
      /^https:\/\/example\.test\/api\/crm\/unsubscribe\/[0-9a-f-]{36}$/,
    )
    assert.match(mail.idempotencyKey, new RegExp(`^campaign:${campaignId}:`))
  }

  // Second passage (retry) : rien n'est renvoyé.
  const again = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: r.sendEmail, siteUrl: SITE },
  )
  assert.equal(again.sent, 0)
  assert.equal(r.sent.length, 2)
})

test("G-07 : un échec laisse la cible 'pending', la reprise envoie une seule fois ; 'failed' seulement après la dernière tentative", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ok = uniq("retry-ok")
  const ko = uniq("retry-ko")
  const campaignId = await launchedCampaign([ok, ko])

  const first = recorder(new Set([ko]))
  const r1 = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: first.sendEmail, siteUrl: SITE },
  )
  assert.equal(r1.sent, 1)
  assert.equal(r1.failed, 1)
  assert.deepEqual(await statuses(campaignId), ["pending", "sent"])

  // Reprise : seule la cible en échec est retentée.
  const second = recorder()
  const r2 = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: second.sendEmail, siteUrl: SITE },
  )
  assert.equal(r2.sent, 1)
  assert.deepEqual(
    second.sent.map((m) => m.to),
    [ko],
  )
  assert.deepEqual(await statuses(campaignId), ["sent", "sent"])

  // Échec définitif sur une autre campagne : onFailure → 'failed'.
  const lost = uniq("lost")
  const c2 = await launchedCampaign([lost])
  await deliverCampaignCore(
    { agencyId, campaignId: c2 },
    { runTx, sendEmail: recorder(new Set([lost])).sendEmail, siteUrl: SITE },
  )
  assert.deepEqual(await statuses(c2), ["pending"])
  const marked = await runTx((tx) =>
    markRemainingTargetsFailedCore(tx, { agencyId, campaignId: c2 }),
  )
  assert.equal(marked, 1)
  assert.deepEqual(await statuses(c2), ["failed"])
})

test("G-06 : campagne annulée — l'annulation passe les cibles 'skipped' et la livraison n'envoie rien", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const campaignId = await launchedCampaign([
    uniq("cancel-a"),
    uniq("cancel-b"),
  ])
  const cancelled = await withTenantContext(deliveryCtx(), (tx) =>
    cancelCampaignCore(tx, { agencyId, campaignId }),
  )
  assert.deepEqual(cancelled, { ok: true })
  assert.deepEqual(await statuses(campaignId), ["skipped", "skipped"])

  const r = recorder()
  const result = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: r.sendEmail, siteUrl: SITE },
  )
  assert.equal(result.sent, 0)
  assert.equal(r.sent.length, 0)
})

test("G-06 : annulation pendant l'envoi — plus aucun email après l'annulation", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const campaignId = await launchedCampaign([
    uniq("mid-a"),
    uniq("mid-b"),
    uniq("mid-c"),
  ])
  const sent: string[] = []
  const result = await deliverCampaignCore(
    { agencyId, campaignId },
    {
      runTx,
      siteUrl: SITE,
      sendEmail: async (input) => {
        sent.push(input.to)
        // Annulation par le staff juste après le premier envoi.
        await withSystemContext((tx) =>
          tx
            .update(campaigns)
            .set({ status: "cancelled" })
            .where(eq(campaigns.id, campaignId)),
        )
      },
    },
  )
  assert.equal(sent.length, 1)
  assert.equal(result.sent, 1)
  assert.deepEqual(await statuses(campaignId), ["sent", "skipped", "skipped"])
})

test("G-08/G-10 : désinscription — consentement retiré, envoi suivant bloqué, second clic sans effet, lien inconnu refusé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = uniq("unsub")
  const campaignId = await launchedCampaign([email])
  const [target] = await withSystemContext((tx) =>
    tx
      .select({ id: campaignTargets.id })
      .from(campaignTargets)
      .where(eq(campaignTargets.campaignId, campaignId)),
  )

  const first = await withSystemContext((tx) =>
    unsubscribeCampaignTargetCore(tx, target!.id),
  )
  assert.deepEqual(first, { ok: true, alreadyUnsubscribed: false })
  const second = await withSystemContext((tx) =>
    unsubscribeCampaignTargetCore(tx, target!.id),
  )
  assert.deepEqual(second, { ok: true, alreadyUnsubscribed: true })

  const consents = await withSystemContext((tx) =>
    tx
      .select({
        action: leadConsentEvents.action,
        source: leadConsentEvents.source,
      })
      .from(leadConsentEvents)
      .where(
        and(
          eq(leadConsentEvents.agencyId, agencyId),
          eq(leadConsentEvents.contactRef, email.toLowerCase()),
        ),
      ),
  )
  assert.equal(consents.filter((c) => c.action === "withdrawn").length, 1)
  assert.equal(
    await withSystemContext((tx) =>
      hasMarketingConsentCore(tx, {
        agencyId,
        channel: "email",
        contactRef: email,
      }),
    ),
    false,
  )

  const r = recorder()
  const result = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: r.sendEmail, siteUrl: SITE },
  )
  assert.equal(r.sent.length, 0)
  assert.equal(result.outcomes[0]?.code, "CONSENT_REVOKED")

  assert.deepEqual(
    await withSystemContext((tx) =>
      unsubscribeCampaignTargetCore(tx, randomUUID()),
    ),
    { ok: false, code: "NOT_FOUND" },
  )
  assert.deepEqual(
    await withSystemContext((tx) =>
      unsubscribeCampaignTargetCore(tx, "pas-un-uuid"),
    ),
    { ok: false, code: "NOT_FOUND" },
  )
})

test("sans URL publique du site : aucun email envoyé (lien de désinscription impossible)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const campaignId = await launchedCampaign([uniq("nourl")])
  const r = recorder()
  const result = await deliverCampaignCore(
    { agencyId, campaignId },
    { runTx, sendEmail: r.sendEmail, siteUrl: null },
  )
  assert.equal(r.sent.length, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.outcomes[0]?.code, "UNSUBSCRIBE_URL_NOT_CONFIGURED")
  assert.deepEqual(await statuses(campaignId), ["pending"])
})

test("clé d'idempotence stable par cible", () => {
  assert.equal(campaignEmailIdempotencyKey("c1", "t1"), "campaign:c1:t1")
})
