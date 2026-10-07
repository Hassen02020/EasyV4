/**
 * CONTACT-01 — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que les autres tests live de ce
 * dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres local
 * disponible.
 *
 * Couvre : idempotence (2 appels même valeur → même id, seul
 * lastSeenAt avance), isolation tenant, un canal différent pour la
 * même valeur brute produit un contact différent, et confirme que
 * lib/crm/consent-core.ts n'est pas touché par ce chantier.
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
import { agencies, contacts } from "@/lib/db/schema"
import { resolveOrCreateContactCore } from "../contact-core"

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
        name: "CONTACT Agency A",
        agencyType: "ota",
        slug: `contact-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "CONTACT Agency B",
        agencyType: "ota",
        slug: `contact-b-${agencyB.slice(0, 8)}`,
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyA))
    await tx.delete(contacts).where(eq(contacts.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("idempotence : 2 appels, même (agencyId, channel, rawRef) → même id, seul lastSeenAt avance", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const first = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "email",
      rawRef: "Idempotent@Example.COM",
    }),
  )

  await new Promise((r) => setTimeout(r, 10))

  const second = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "email",
      rawRef: "idempotent@example.com",
    }),
  )

  assert.equal(second.id, first.id)
  assert.equal(second.contactRef, "idempotent@example.com")
  assert.equal(second.firstSeenAt.getTime(), first.firstSeenAt.getTime())
  assert.ok(second.lastSeenAt.getTime() >= first.lastSeenAt.getTime())
})

test("canal différent, même valeur brute → 2 contacts distincts (jamais fusionnés)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const emailContact = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "email",
      rawRef: "same-value@example.com",
    }),
  )
  const webContact = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "web",
      rawRef: "same-value@example.com",
    }),
  )

  assert.notEqual(emailContact.id, webContact.id)
})

test("isolation tenant : même (channel, rawRef) pour 2 agences → 2 contacts distincts", async (t) => {
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

  const contactA = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "email",
      rawRef: "shared@example.com",
    }),
  )
  const contactB = await withTenantContext(ctxB, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyB,
      channel: "email",
      rawRef: "shared@example.com",
    }),
  )

  assert.notEqual(contactA.id, contactB.id)
  assert.equal(contactA.agencyId, agencyA)
  assert.equal(contactB.agencyId, agencyB)
})

test("téléphone normalisé : 2 écritures différentes du même numéro → même contact", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const first = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      rawRef: "20 000 002",
    }),
  )
  const second = await withTenantContext(ctxA, (tx) =>
    resolveOrCreateContactCore(tx, {
      agencyId: agencyA,
      channel: "whatsapp",
      rawRef: "+216 20 000 002",
    }),
  )

  assert.equal(second.id, first.id)
  assert.equal(second.contactRef, "+21620000002")
})

test("CONTACT-01 n'a aucune dépendance vers CONSENT-01 (chantiers indépendants, branches séparées)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/crm/contact-core.ts"),
    "utf8",
  )
  // Preuve négative directe sur les imports réels (pas sur la prose des
  // commentaires, qui mentionne consent-core.ts pour expliquer pourquoi
  // il n'est PAS importé) : aucune ligne `import ... from "...consent-core"`.
  const hasConsentImport = /^import .*consent-core/m.test(src)
  assert.equal(hasConsentImport, false)
})
