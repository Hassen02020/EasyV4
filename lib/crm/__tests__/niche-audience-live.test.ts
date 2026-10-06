/**
 * NICHE-AUDIENCE-01 — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que les autres tests live de ce
 * dépôt : se dégrade en `skip` sans DATABASE_URL/Postgres local disponible.
 *
 * Couvre : cohérence mathématique (audience.length === segment.volume
 * pour les mêmes dimensions + période), isolation tenant stricte (jamais
 * les leads d'une autre agence).
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
import { agencies, leads } from "@/lib/db/schema"
import { createLeadCore } from "../leads-core"
import { getNicheSegmentsCore, getNicheAudienceCore } from "../niche-core"

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
        name: "NICHE-AUDIENCE Agency A",
        agencyType: "ota",
        slug: `niche-aud-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "NICHE-AUDIENCE Agency B",
        agencyType: "ota",
        slug: `niche-aud-b-${agencyB.slice(0, 8)}`,
      },
    ])
  })

  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }
  const ctxB: TenantContext = {
    agencyId: agencyB,
    userId: "",
    isSuperAdmin: true,
  }

  // 3 leads identiques (même dimension) pour agencyA, 1 pour agencyB —
  // mêmes caractéristiques de segment, agences différentes.
  for (let i = 0; i < 3; i++) {
    await withTenantContext(ctxA, (tx) =>
      createLeadCore(tx, {
        agencyId: agencyA,
        firstName: `LeadA${i}`,
        email: `lead-a-${i}-${agencyA.slice(0, 6)}@example.com`,
        productType: "package",
        market: "tunisia",
        intention: "groupe",
        destination: "Istanbul",
        sourcePage: "/",
      }),
    )
  }
  await withTenantContext(ctxB, (tx) =>
    createLeadCore(tx, {
      agencyId: agencyB,
      firstName: "LeadB0",
      email: `lead-b-0-${agencyB.slice(0, 6)}@example.com`,
      productType: "package",
      market: "tunisia",
      intention: "groupe",
      destination: "Istanbul",
      sourcePage: "/",
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(leads).where(eq(leads.agencyId, agencyA))
    await tx.delete(leads).where(eq(leads.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("NICHE-AUDIENCE-01 : cohérence mathématique — audience.length === segment.volume pour les mêmes dimensions + période", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const segments = await withTenantContext(ctxA, (tx) =>
    getNicheSegmentsCore(tx, { agencyId: agencyA }),
  )
  const segment = segments.find(
    (s) => s.destination === "Istanbul" && s.intention === "groupe",
  )
  assert.ok(segment, "le segment Istanbul/groupe doit exister")
  assert.equal(segment!.volume, 3)

  const audience = await withTenantContext(ctxA, (tx) =>
    getNicheAudienceCore(tx, {
      agencyId: agencyA,
      market: segment!.market,
      productType: segment!.productType,
      intention: segment!.intention,
      destination: segment!.destination,
      originAgencyId: segment!.originAgencyId,
      capturedByUserId: segment!.capturedByUserId,
      channel: segment!.channel,
      campaignRef: segment!.campaignRef,
      period: segment!.period,
    }),
  )

  assert.equal(
    audience.length,
    segment!.volume,
    "audience.length doit être EXACTEMENT égal à segment.volume",
  )
})

test("NICHE-AUDIENCE-01 : isolation tenant — l'audience de l'agence A ne contient jamais un lead de l'agence B, même dimension identique", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = {
    agencyId: agencyA,
    userId: "",
    isSuperAdmin: true,
  }

  const segments = await withTenantContext(ctxA, (tx) =>
    getNicheSegmentsCore(tx, { agencyId: agencyA }),
  )
  const segment = segments.find((s) => s.destination === "Istanbul")!

  const audience = await withTenantContext(ctxA, (tx) =>
    getNicheAudienceCore(tx, {
      agencyId: agencyA,
      market: segment.market,
      productType: segment.productType,
      intention: segment.intention,
      destination: segment.destination,
      originAgencyId: segment.originAgencyId,
      capturedByUserId: segment.capturedByUserId,
      channel: segment.channel,
      campaignRef: segment.campaignRef,
      period: segment.period,
    }),
  )

  assert.equal(audience.length, 3)
  assert.ok(
    audience.every((l) => l.email?.includes(agencyA.slice(0, 6))),
    "aucun lead de l'agence B ne doit apparaître dans l'audience de l'agence A",
  )
})
