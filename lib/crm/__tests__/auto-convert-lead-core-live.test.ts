/**
 * CRM-AUTO-CONVERT-TESTS-01 (écart G-42) — preuve live (Postgres réel,
 * app_runtime, RLS forcée) de `autoConvertLeadCore`, appelé par la fonction
 * Inngest `auto-convert-lead` sur `booking/confirmed`. Jusqu'ici aucun test.
 *
 * Règles prouvées : 1 seul lead correspondant (email OU téléphone, statut
 * new/contacted, sans réservation liée, même agence) → converti et lié ;
 * 0 ou ≥2 → rien n'est modifié ; réservation déjà liée → rien ; aucun
 * critère → rien ; un lead d'une autre agence n'est jamais touché.
 * Se dégrade en `skip` sans base locale.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, customers, leads, reservations } from "@/lib/db/schema"
import { autoConvertLeadCore } from "../leads-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
let agencyId = ""
let otherAgencyId = ""
let customerId = ""
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

async function makeLead(
  values: {
    email?: string | null
    phone?: string | null
    status?: "new" | "contacted" | "qualified" | "converted" | "lost"
  },
  agency = agencyId,
) {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(leads)
      .values({
        agencyId: agency,
        firstName: "Prospect",
        sourcePage: "/contact",
        email: values.email ?? null,
        phone: values.phone ?? null,
        ...(values.status ? { status: values.status } : {}),
      })
      .returning({ id: leads.id }),
  )
  return row!.id
}

async function makeReservation() {
  const [row] = await withSystemContext((tx) =>
    tx
      .insert(reservations)
      .values({
        agencyId,
        publicRef: `AC-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "hotel",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id }),
  )
  return row!.id
}

async function readLead(id: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        status: leads.status,
        reservationId: leads.reservationId,
        convertedAt: leads.convertedAt,
        handledByUserId: leads.handledByUserId,
      })
      .from(leads)
      .where(eq(leads.id, id)),
  )
  return row!
}

const run = (params: {
  reservationId: string
  customerEmail: string | null
  customerPhone: string | null
}) =>
  withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    autoConvertLeadCore(tx, { agencyId, ...params }),
  )

const uniq = () => randomUUID().slice(0, 8)

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  otherAgencyId = randomUUID()
  await withSystemContext(async (tx) => {
    for (const id of [agencyId, otherAgencyId]) {
      await tx.insert(agencies).values({
        id,
        slug: `auto-convert-${id.slice(0, 8)}`,
        name: "CRM-AUTO-CONVERT-TESTS-01 fixture",
        agencyType: "ota",
      })
    }
    const [c] = await tx
      .insert(customers)
      .values({ agencyId, firstName: "Client", lastName: "Test" })
      .returning({ id: customers.id })
    customerId = c!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    for (const id of [agencyId, otherAgencyId]) {
      await tx.delete(leads).where(eq(leads.agencyId, id))
      await tx.delete(reservations).where(eq(reservations.agencyId, id))
      await tx.delete(customers).where(eq(customers.agencyId, id))
      await tx.delete(agencies).where(eq(agencies.id, id))
    }
  })
})

test("1 seul lead correspondant (email) → converti, lié à la réservation, conversion système", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `one-${uniq()}@example.test`
  const leadId = await makeLead({ email })
  const reservationId = await makeReservation()

  const result = await run({
    reservationId,
    customerEmail: email,
    customerPhone: null,
  })
  assert.deepEqual(result, { outcome: "converted", leadId })

  const lead = await readLead(leadId)
  assert.equal(lead.status, "converted")
  assert.equal(lead.reservationId, reservationId)
  assert.ok(lead.convertedAt instanceof Date)
  assert.equal(lead.handledByUserId, null)

  // Rejouer l'événement : la réservation est déjà liée → rien de plus.
  assert.deepEqual(
    await run({ reservationId, customerEmail: email, customerPhone: null }),
    { outcome: "skipped", reason: "already_linked" },
  )
})

test("correspondance par téléphone seul (statut 'contacted' accepté)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const phone = `+2169${Date.now().toString().slice(-7)}`
  const leadId = await makeLead({ phone, status: "contacted" })
  const reservationId = await makeReservation()
  const result = await run({
    reservationId,
    customerEmail: `autre-${uniq()}@example.test`,
    customerPhone: phone,
  })
  assert.deepEqual(result, { outcome: "converted", leadId })
})

test("2 leads correspondants → ambigu : aucun lead modifié (conversion manuelle)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `amb-${uniq()}@example.test`
  const a = await makeLead({ email })
  const b = await makeLead({ email })
  const reservationId = await makeReservation()
  assert.deepEqual(
    await run({ reservationId, customerEmail: email, customerPhone: null }),
    { outcome: "skipped", reason: "ambiguous" },
  )
  for (const id of [a, b]) {
    const lead = await readLead(id)
    assert.equal(lead.status, "new")
    assert.equal(lead.reservationId, null)
  }
})

test("aucun lead / lead déjà qualifié, perdu ou converti → no_match, rien modifié", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `closed-${uniq()}@example.test`
  const ids = [
    await makeLead({ email, status: "qualified" }),
    await makeLead({ email, status: "lost" }),
  ]
  const reservationId = await makeReservation()
  assert.deepEqual(
    await run({ reservationId, customerEmail: email, customerPhone: null }),
    { outcome: "skipped", reason: "no_match" },
  )
  for (const id of ids) {
    assert.equal((await readLead(id)).reservationId, null)
  }
  assert.deepEqual(
    await run({
      reservationId,
      customerEmail: `personne-${uniq()}@example.test`,
      customerPhone: null,
    }),
    { outcome: "skipped", reason: "no_match" },
  )
})

test("sans email ni téléphone → no_criteria", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const reservationId = await makeReservation()
  assert.deepEqual(
    await run({ reservationId, customerEmail: null, customerPhone: null }),
    { outcome: "skipped", reason: "no_criteria" },
  )
})

test("lead d'une autre agence avec le même email → jamais touché", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const email = `cross-${uniq()}@example.test`
  const foreign = await makeLead({ email }, otherAgencyId)
  const reservationId = await makeReservation()
  assert.deepEqual(
    await run({ reservationId, customerEmail: email, customerPhone: null }),
    { outcome: "skipped", reason: "no_match" },
  )
  const lead = await readLead(foreign)
  assert.equal(lead.status, "new")
  assert.equal(lead.reservationId, null)
})
