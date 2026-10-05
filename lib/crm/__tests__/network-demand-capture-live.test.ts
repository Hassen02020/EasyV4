/**
 * NETWORK-DEMAND-CAPTURE-01 — preuve live contre un Postgres réel (RLS
 * incluse via withTenantContext), même convention que leads-core.test.ts :
 * se dégrade en `skip` sans DATABASE_URL/Postgres local disponible.
 *
 * Couvre : autorisation à l'écriture, isolation tenant, append-only
 * (aucune fonction UPDATE/DELETE exposée sur le journal), résolution
 * persistée correctement sur `leads` après un événement.
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
import { agencies, leads, leadOriginEvents } from "@/lib/db/schema"
import { createLeadCore } from "../leads-core"
import {
  recordLeadOriginEventCore,
  getLeadOriginEventsCore,
} from "../network-demand-capture-core"

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
let leadA = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyA,
        name: "NDC Agency A",
        agencyType: "ota",
        slug: `ndc-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "NDC Agency B",
        agencyType: "ota",
        slug: `ndc-b-${agencyB.slice(0, 8)}`,
      },
    ])
  })

  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const { id } = await withTenantContext(ctxA, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyA,
      firstName: "Test",
      email: "ndc@example.com",
      productType: "general",
      sourcePage: "/",
    }),
  )
  leadA = id
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx
      .delete(leadOriginEvents)
      .where(eq(leadOriginEvents.agencyId, agencyA))
    await tx
      .delete(leadOriginEvents)
      .where(eq(leadOriginEvents.agencyId, agencyB))
    await tx.delete(leads).where(eq(leads.agencyId, agencyA))
    await tx.delete(leads).where(eq(leads.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("recordLeadOriginEventCore : événement autorisé → inséré, colonne résolue mise à jour sur leads", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const result = await withTenantContext(ctxA, (tx) =>
    recordLeadOriginEventCore(tx, {
      agencyId: agencyA,
      leadId: leadA,
      role: "channel",
      actorRef: "whatsapp",
      source: "whatsapp_webhook",
      authorized: true,
    }),
  )
  assert.equal(result.ok, true)

  const [row] = await withTenantContext(ctxA, (tx) =>
    tx
      .select({ channel: leads.channel })
      .from(leads)
      .where(eq(leads.id, leadA)),
  )
  assert.equal(row?.channel, "whatsapp")
})

test("recordLeadOriginEventCore : événement NON autorisé → rejeté, journal inchangé", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const before = await withTenantContext(ctxA, (tx) =>
    getLeadOriginEventsCore(tx, { agencyId: agencyA, leadId: leadA }),
  )

  const result = await withTenantContext(ctxA, (tx) =>
    recordLeadOriginEventCore(tx, {
      agencyId: agencyA,
      leadId: leadA,
      role: "origin_agency",
      actorRef: agencyB,
      source: "partner_portal_claim",
      authorized: false,
    }),
  )
  assert.deepEqual(result, { ok: false, code: "NOT_AUTHORIZED" })

  const afterEvents = await withTenantContext(ctxA, (tx) =>
    getLeadOriginEventsCore(tx, { agencyId: agencyA, leadId: leadA }),
  )
  assert.equal(afterEvents.length, before.length, "aucun événement ajouté")
})

test("isolation tenant : getLeadOriginEventsCore sous le contexte B ne voit jamais les événements de A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxB: TenantContext = {
    agencyId: agencyB,
    userId: "",
    isSuperAdmin: false,
  }

  const eventsFromB = await withTenantContext(ctxB, (tx) =>
    getLeadOriginEventsCore(tx, { agencyId: agencyB, leadId: leadA }),
  )
  assert.equal(eventsFromB.length, 0)
})

test("append-only : aucune fonction UPDATE/DELETE n'est exposée sur le journal (grant DB confirmé séparément)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/crm/network-demand-capture-core.ts"),
    "utf8",
  )
  assert.equal(src.includes(".update(leadOriginEvents)"), false)
  assert.equal(src.includes(".delete(leadOriginEvents)"), false)
})

test("sources préparatoires (partner_portal_claim, utm_capture) n'ont AUCUN appelant réel dans app/ ou lib/ — jamais présentées comme opérationnelles", () => {
  for (const preparatory of ["partner_portal_claim", "utm_capture"]) {
    const grep = execSync(
      `grep -rl "${preparatory}" app lib --include="*.ts" --include="*.tsx" || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    )
    const files = grep
      .split("\n")
      .filter(Boolean)
      .filter(
        (f) =>
          !f.includes("__tests__") &&
          !f.includes("network-demand-capture-core.ts"),
      )
    assert.deepEqual(
      files,
      [],
      `"${preparatory}" ne doit apparaître que dans la constante LEAD_ORIGIN_SOURCE_TRUST et les tests — trouvé un appelant réel : ${files.join(", ")}`,
    )
  }
})
