/**
 * CONSENT-01 — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que les autres tests live de ce
 * dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres local disponible.
 *
 * Couvre : isolation tenant stricte, isolation canal/finalité (un
 * consentement email n'est jamais utilisé pour whatsapp), append-only
 * (aucune fonction UPDATE/DELETE exposée), validation des valeurs
 * invalides (channel/purpose/action).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import { eq, sql } from "drizzle-orm"
import {
  withTenantContext,
  withSystemContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, leadConsentEvents } from "@/lib/db/schema"
import {
  recordConsentEventCore,
  hasMarketingConsentCore,
  getConsentEventsCore,
} from "../consent-core"

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
let agencyB = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyA,
        name: "CONSENT Agency A",
        agencyType: "ota",
        slug: `consent-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "CONSENT Agency B",
        agencyType: "ota",
        slug: `consent-b-${agencyB.slice(0, 8)}`,
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyA))
    await tx
      .delete(leadConsentEvents)
      .where(eq(leadConsentEvents.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("recordConsentEventCore : événement valide → inséré, hasMarketingConsentCore → true", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "live-test@example.com",
      purpose: "marketing",
      action: "granted",
      source: "lead_capture_form_checkbox",
    }),
  )
  assert.equal(result.ok, true)

  const hasConsent = await withTenantContext(ctxA, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "live-test@example.com",
    }),
  )
  assert.equal(hasConsent, true)
})

test("recordConsentEventCore : channel/purpose/action invalides → rejetés, jamais insérés", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const badChannel = await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "carrier_pigeon",
      contactRef: "x@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  assert.deepEqual(badChannel, { ok: false, code: "INVALID_CHANNEL" })

  const badPurpose = await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "x@example.com",
      purpose: "transactional",
      action: "granted",
      source: "test",
    }),
  )
  assert.deepEqual(badPurpose, { ok: false, code: "INVALID_PURPOSE" })

  const badAction = await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "x@example.com",
      purpose: "marketing",
      action: "maybe",
      source: "test",
    }),
  )
  assert.deepEqual(badAction, { ok: false, code: "INVALID_ACTION" })
})

test("isolation canal : consentement email n'est JAMAIS utilisé pour whatsapp, même contact", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const contactRef = "channel-isolation@example.com"

  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const emailConsent = await withTenantContext(ctxA, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
    }),
  )
  const whatsappConsent = await withTenantContext(ctxA, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactRef,
    }),
  )

  assert.equal(emailConsent, true)
  assert.equal(
    whatsappConsent,
    false,
    "un consentement email ne doit jamais s'appliquer à whatsapp",
  )
})

test("isolation tenant : un consentement de l'agence A n'est jamais visible depuis l'agence B, même contactRef identique", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const ctxB: TenantContext = {
    agencyId: agencyB,
    userId: "",
    isSuperAdmin: false,
  }
  const contactRef = "tenant-isolation@example.com"

  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const consentFromB = await withTenantContext(ctxB, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyB,
      channel: "email",
      contactRef,
    }),
  )
  assert.equal(
    consentFromB,
    false,
    "l'agence B ne doit jamais voir le consentement de l'agence A",
  )

  const eventsFromB = await withTenantContext(ctxB, (tx) =>
    getConsentEventsCore(tx, {
      agencyId: agencyB,
      channel: "email",
      contactRef,
    }),
  )
  assert.equal(eventsFromB.length, 0)
})

test("getConsentEventsCore : historique complet préservé après granted → withdrawn (jamais écrasé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const contactRef = "history@example.com"

  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
      purpose: "marketing",
      action: "withdrawn",
      source: "test",
    }),
  )

  const history = await withTenantContext(ctxA, (tx) =>
    getConsentEventsCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
    }),
  )
  assert.equal(history.length, 2, "les 2 événements doivent rester visibles")

  const currentStatus = await withTenantContext(ctxA, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef,
    }),
  )
  assert.equal(currentStatus, false)
})

test("append-only : aucune fonction UPDATE/DELETE n'est exposée sur le journal (grant DB confirmé séparément)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/crm/consent-core.ts"),
    "utf8",
  )
  assert.equal(src.includes(".update(leadConsentEvents)"), false)
  assert.equal(src.includes(".delete(leadConsentEvents)"), false)
})

test("normalisation : contactRef normalisé avant stockage — recherche insensible à la casse pour un email", async (t) => {
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
      contactRef: "Mixed-Case@Example.COM",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const consent = await withTenantContext(ctxA, (tx) =>
    hasMarketingConsentCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "mixed-case@example.com",
    }),
  )
  assert.equal(consent, true)
})
