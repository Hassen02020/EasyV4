/**
 * MARGIN-RULES-AGREEMENT-RLS-01 — preuve sur PostgreSQL réel
 * (drizzle/manual/0148) : une agence ne peut ni créer, ni modifier, ni
 * supprimer une règle de marge liée à un accord commercial, ni rattacher
 * une de ses règles à un accord ; seul le super_admin le peut. Les rôles
 * `anon` / `authenticated` (route PostgREST) n'ont plus aucun privilège.
 *
 * Les assertions passent par le rôle applicatif réel `app_runtime`
 * (`DATABASE_URL`, RLS appliquée) sous `withTenantContext`, exactement
 * comme les server actions. `DATABASE_DIRECT_URL` (superuser du conteneur)
 * sert uniquement à jouer les rôles `anon` / `authenticated` par SET ROLE.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, commercialAgreements } from "@/lib/db/schema"
import { marginRules } from "@/lib/db/schema/financials"

let dbAvailable = false
const skip = () => "Postgres local indisponible (DATABASE_URL)."

const agencyA = randomUUID()
const agencyB = randomUUID()
let agreementId = ""
let linkedRuleId = ""

const asAgency = (agencyId: string) =>
  ({ agencyId, userId: randomUUID(), isSuperAdmin: false }) as const
const asSuperAdmin = {
  agencyId: null,
  userId: randomUUID(),
  isSuperAdmin: true,
}

/** Erreur RLS Postgres (42501) remontée par drizzle/postgres-js. */
function isRlsDenied(e: unknown): boolean {
  const err = e as {
    code?: string
    cause?: { code?: string }
    message?: string
  }
  return (
    err?.code === "42501" ||
    err?.cause?.code === "42501" ||
    /row-level security|permission denied/i.test(String(err?.message))
  )
}

const ruleValues = (agencyId: string, extra: Record<string, unknown> = {}) => ({
  agencyId,
  name: "RLS test",
  type: "percent" as const,
  percentValue: "2.00",
  productType: "network",
  ...extra,
})

async function readRule(id: string) {
  return withSystemContext(async (tx) => {
    const [r] = await tx
      .select()
      .from(marginRules)
      .where(eq(marginRules.id, id))
    return r
  })
}

before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    for (const id of [agencyA, agencyB]) {
      await tx.insert(agencies).values({
        id,
        slug: `mr-rls-${id.slice(0, 8)}`,
        name: "MARGIN-RULES-AGREEMENT-RLS-01 fixture",
        agencyType: "ota",
      })
    }
  })
  // Accord + ligne de taux créés par le super_admin (seul chemin autorisé).
  ;[agreementId, linkedRuleId] = await withTenantContext(
    asSuperAdmin,
    async (tx) => {
      const [a] = await tx
        .insert(commercialAgreements)
        .values({
          sellerPartyType: "agency",
          sellerPartyId: agencyA,
          easy2bookRole: "platform",
          channel: "network",
          status: "draft",
          createdByUserId: asSuperAdmin.userId,
        })
        .returning({ id: commercialAgreements.id })
      const [r] = await tx
        .insert(marginRules)
        .values(ruleValues(agencyA, { agreementId: a!.id }))
        .returning({ id: marginRules.id })
      return [a!.id, r!.id]
    },
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    for (const id of [agencyA, agencyB]) {
      await tx.delete(marginRules).where(eq(marginRules.agencyId, id))
      await tx
        .delete(commercialAgreements)
        .where(eq(commercialAgreements.sellerPartyId, id))
      await tx.delete(agencies).where(eq(agencies.id, id))
    }
  })
})

test("live : le super_admin crée, modifie et supprime une règle liée à un accord", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const id = await withTenantContext(asSuperAdmin, async (tx) => {
    const [r] = await tx
      .insert(marginRules)
      .values(ruleValues(agencyA, { agreementId }))
      .returning({ id: marginRules.id })
    const upd = await tx
      .update(marginRules)
      .set({ percentValue: "3.00" })
      .where(eq(marginRules.id, r!.id))
      .returning({ id: marginRules.id })
    assert.equal(upd.length, 1)
    return r!.id
  })
  assert.equal((await readRule(id))!.percentValue, "3.00")
  const del = await withTenantContext(asSuperAdmin, (tx) =>
    tx
      .delete(marginRules)
      .where(eq(marginRules.id, id))
      .returning({ id: marginRules.id }),
  )
  assert.equal(del.length, 1)
})

test("live : l'agence lit sa règle liée (nécessaire au calcul de la part Easy2Book)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const rows = await withTenantContext(asAgency(agencyA), (tx) =>
    tx
      .select({ id: marginRules.id })
      .from(marginRules)
      .where(eq(marginRules.id, linkedRuleId)),
  )
  assert.equal(rows.length, 1)
})

test("live : l'agence ne peut pas créer une règle liée à un accord", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  await assert.rejects(
    withTenantContext(asAgency(agencyA), (tx) =>
      tx.insert(marginRules).values(ruleValues(agencyA, { agreementId })),
    ),
    isRlsDenied,
  )
})

test("live : l'agence ne peut ni modifier ni supprimer la règle liée (0 ligne touchée, valeur intacte)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const upd = await withTenantContext(asAgency(agencyA), (tx) =>
    tx
      .update(marginRules)
      .set({ percentValue: "0.00" })
      .where(eq(marginRules.id, linkedRuleId))
      .returning({ id: marginRules.id }),
  )
  assert.equal(upd.length, 0)
  const detach = await withTenantContext(asAgency(agencyA), (tx) =>
    tx
      .update(marginRules)
      .set({ agreementId: null })
      .where(eq(marginRules.id, linkedRuleId))
      .returning({ id: marginRules.id }),
  )
  assert.equal(detach.length, 0)
  const del = await withTenantContext(asAgency(agencyA), (tx) =>
    tx
      .delete(marginRules)
      .where(eq(marginRules.id, linkedRuleId))
      .returning({ id: marginRules.id }),
  )
  assert.equal(del.length, 0)
  const r = await readRule(linkedRuleId)
  assert.equal(r!.percentValue, "2.00")
  assert.equal(r!.agreementId, agreementId)
})

test("live : l'agence ne peut pas rattacher une de ses règles libres à un accord", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const [free] = await withTenantContext(asAgency(agencyA), (tx) =>
    tx
      .insert(marginRules)
      .values(ruleValues(agencyA))
      .returning({ id: marginRules.id }),
  )
  await assert.rejects(
    withTenantContext(asAgency(agencyA), (tx) =>
      tx
        .update(marginRules)
        .set({ agreementId })
        .where(eq(marginRules.id, free!.id)),
    ),
    isRlsDenied,
  )
  assert.equal((await readRule(free!.id))!.agreementId, null)
})

test("live : règles sans accord — l'agence garde la main sur les siennes (aucune régression)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  await withTenantContext(asAgency(agencyA), async (tx) => {
    const [r] = await tx
      .insert(marginRules)
      .values(ruleValues(agencyA))
      .returning({ id: marginRules.id })
    const upd = await tx
      .update(marginRules)
      .set({ percentValue: "4.00" })
      .where(eq(marginRules.id, r!.id))
      .returning({ id: marginRules.id })
    assert.equal(upd.length, 1)
    const del = await tx
      .delete(marginRules)
      .where(eq(marginRules.id, r!.id))
      .returning({ id: marginRules.id })
    assert.equal(del.length, 1)
  })
})

test("live : une autre agence ne voit ni ne touche les règles de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  await withTenantContext(asAgency(agencyB), async (tx) => {
    const seen = await tx
      .select()
      .from(marginRules)
      .where(eq(marginRules.id, linkedRuleId))
    assert.equal(seen.length, 0)
  })
  await assert.rejects(
    withTenantContext(asAgency(agencyB), (tx) =>
      tx.insert(marginRules).values(ruleValues(agencyA)),
    ),
    isRlsDenied,
  )
})

test("live : anon / authenticated (route PostgREST) — aucun privilège, TRUNCATE compris", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const rows = await withSystemContext((tx) =>
    tx.execute<{ role: string; priv: string; ok: boolean }>(sql`
      select r.role, p.priv, has_table_privilege(r.role, 'margin_rules', p.priv) as ok
      from (values ('anon'), ('authenticated')) r(role)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
    `),
  )
  const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows
  assert.equal(list.length, 10)
  for (const r of list as { role: string; priv: string; ok: boolean }[]) {
    assert.equal(r.ok, false, `${r.role} ${r.priv}`)
  }
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const db = postgres(directUrl, { max: 1 })
  try {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        db.begin(async (q) => {
          await q.unsafe(`set local role ${role}`)
          await q`insert into margin_rules (agency_id, name, agreement_id)
                  values (${agencyA}, 'bypass', ${agreementId})`
        }),
        /permission denied/,
        role,
      )
    }
  } finally {
    await db.end()
  }
})

test("live : RLS activée et forcée, policies attendues", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const res = await withSystemContext((tx) =>
    tx.execute<{ rls: boolean; force: boolean; policies: string }>(sql`
      select c.relrowsecurity as rls, c.relforcerowsecurity as force,
             (select string_agg(policyname || ':' || cmd, ',' order by policyname)
                from pg_policies where tablename = 'margin_rules') as policies
      from pg_class c where c.relname = 'margin_rules'
    `),
  )
  const row = (
    Array.isArray(res) ? res : (res as { rows: unknown[] }).rows
  )[0] as {
    rls: boolean
    force: boolean
    policies: string
  }
  assert.equal(row.rls, true)
  assert.equal(row.force, true)
  assert.equal(
    row.policies,
    "margin_rules_delete:DELETE,margin_rules_insert:INSERT,margin_rules_read:SELECT,margin_rules_update:UPDATE",
  )
})
