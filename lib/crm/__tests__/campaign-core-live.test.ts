/**
 * CAMPAIGN-01 — preuve live contre un Postgres réel : filterAudienceByConsentCore
 * orchestre réellement CONTACT-01 (déduplication) puis CONSENT-01
 * (éligibilité), jamais un calcul parallèle. Même convention que les
 * autres tests live de ce dépôt : se dégrade en `skip` sans
 * DATABASE_URL/Postgres local disponible.
 *
 * Couvre le flux imposé par l'audit : AUDIENCE → LEADs → CONTACTs
 * uniques (CONTACT-01) → CONSENT (CONSENT-01) → CONTACTs éligibles.
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
import { agencies, contacts, leadConsentEvents } from "@/lib/db/schema"
import { recordConsentEventCore } from "../consent-core"
import { filterAudienceByConsentCore } from "../campaign-core"

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
        name: "CAMPAIGN Agency A",
        agencyType: "ota",
        slug: `campaign-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "CAMPAIGN Agency B",
        agencyType: "ota",
        slug: `campaign-b-${agencyB.slice(0, 8)}`,
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
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyA))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("2 leads du même contact consentant → 1 CONTACT unique, eligible: true, leadIds regroupe les 2", async (t) => {
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
      contactRef: "consenting@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyA,
      audience: [
        { id: "lead-1a", email: "Consenting@Example.com", phone: null },
        { id: "lead-1b", email: "CONSENTING@EXAMPLE.COM", phone: null },
      ],
      channel: "email",
    }),
  )

  assert.equal(result.contacts.length, 1, "doit résoudre à un seul CONTACT")
  assert.equal(result.excludedLeads.length, 0)
  const [contact] = result.contacts
  assert.equal(contact!.eligible, true)
  assert.equal(contact!.contactRef, "consenting@example.com")
  assert.deepEqual(new Set(contact!.leadIds), new Set(["lead-1a", "lead-1b"]))
})

test("PREUVE CENTRALE — 3 LEADs → 2 CONTACTs → 1 CONTACT éligible = 1 cible CAMPAIGN", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  // 2 des 3 leads partagent le même point de contact (même email, casse
  // différente) → doivent résoudre à 1 seul CONTACT. Le 3e lead est un
  // contact distinct, jamais consentant.
  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "email",
      contactRef: "proof@example.com",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )
  // contact-2 (lead-p3) n'a volontairement AUCUN événement de consentement.

  const result = await withTenantContext(ctxA, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyA,
      audience: [
        { id: "lead-p1", email: "Proof@Example.com", phone: null },
        { id: "lead-p2", email: "PROOF@EXAMPLE.COM", phone: null },
        { id: "lead-p3", email: "other-contact@example.com", phone: null },
      ],
      channel: "email",
    }),
  )

  // 3 LEADs → 2 CONTACTs (déduplication CONTACT-01 réelle, pas simulée).
  assert.equal(
    result.contacts.length,
    2,
    "3 LEADs doivent résoudre à 2 CONTACTs",
  )
  assert.equal(result.excludedLeads.length, 0)

  const proofContact = result.contacts.find(
    (c) => c.contactRef === "proof@example.com",
  )
  const otherContact = result.contacts.find(
    (c) => c.contactRef === "other-contact@example.com",
  )
  assert.ok(proofContact)
  assert.ok(otherContact)

  // 2 CONTACTs → 1 CONTACT éligible (CONSENT-01 réel, pas simulé).
  const eligibleContacts = result.contacts.filter((c) => c.eligible)
  assert.equal(
    eligibleContacts.length,
    1,
    "des 2 CONTACTs, un seul doit être éligible",
  )
  assert.equal(eligibleContacts[0]!.contactRef, "proof@example.com")

  // Le CONTACT éligible regroupe bien les 2 LEADs d'origine → 1 cible
  // CAMPAIGN unique, jamais 2 envois dupliqués.
  assert.deepEqual(
    new Set(proofContact!.leadIds),
    new Set(["lead-p1", "lead-p2"]),
  )
  assert.equal(otherContact!.eligible, false)
  assert.deepEqual(otherContact!.leadIds, ["lead-p3"])
})

test("contact sans aucun événement de consentement → eligible: false (jamais une présomption d'accord)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyA,
      audience: [
        { id: "lead-2", email: "never-consented@example.com", phone: null },
      ],
      channel: "email",
    }),
  )

  assert.equal(result.contacts.length, 1)
  assert.equal(result.contacts[0]!.eligible, false)
})

test("canal sans champ équivalent (instagram) → lead exclu via excludedLeads, jamais passé à CONTACT-01", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyA,
      audience: [
        {
          id: "lead-3",
          email: "consenting@example.com",
          phone: "+21620000001",
        },
      ],
      channel: "instagram",
    }),
  )

  assert.equal(result.contacts.length, 0)
  assert.deepEqual(result.excludedLeads, [
    { leadId: "lead-3", reason: "NO_CONTACT_REF" },
  ])
})

test("téléphone écrit différemment par 2 leads → même CONTACT (via normalisation CONTACT-01)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  await withTenantContext(ctxA, (tx) =>
    recordConsentEventCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      contactRef: "+21620000099",
      purpose: "marketing",
      action: "granted",
      source: "test",
    }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyA,
      audience: [
        { id: "lead-4a", email: null, phone: "20 000 099" },
        { id: "lead-4b", email: null, phone: "+216 20 000 099" },
      ],
      channel: "whatsapp",
    }),
  )

  assert.equal(result.contacts.length, 1)
  assert.equal(result.contacts[0]!.eligible, true)
  assert.deepEqual(
    new Set(result.contacts[0]!.leadIds),
    new Set(["lead-4a", "lead-4b"]),
  )
})

test("isolation tenant : consentement de l'agence A jamais pris en compte pour l'agence B", async (t) => {
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
  const contactRef = "shared-contact@example.com"

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

  const resultFromB = await withTenantContext(ctxB, (tx) =>
    filterAudienceByConsentCore(tx, {
      agencyId: agencyB,
      audience: [{ id: "lead-5", email: contactRef, phone: null }],
      channel: "email",
    }),
  )

  assert.equal(resultFromB.contacts.length, 1)
  assert.equal(resultFromB.contacts[0]!.eligible, false)
})

test("CAMPAIGN-01 n'implémente aucune logique propre de consentement : aucun accès direct à lead_consent_events", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/crm/campaign-core.ts"),
    "utf8",
  )
  assert.equal(src.includes("leadConsentEvents"), false)
  assert.equal(src.includes("resolveConsentStatusCore"), false)
  assert.ok(src.includes("hasMarketingConsentCore"))
  assert.ok(src.includes("resolveOrCreateContactCore"))
})
