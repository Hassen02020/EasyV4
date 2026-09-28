/**
 * CERTIFICATION — isolation RLS du catalogue privé Mutuelle
 * (mutuelle_catalog_items, drizzle/manual/0063_mutuelle_catalog.sql).
 *
 * Même méthodologie que lib/__tests__/tenant-isolation-certification.test.ts :
 * ces tests prouvent que la BASE elle-même refuse un accès cross-groupe —
 * même si le code applicatif (lib/mutuelle/catalog-actions.ts) oubliait un
 * filtre, RLS+FORCE bloque quand même. Se dégrade en `skip` sans Postgres
 * local (DATABASE_URL doit pointer sur le rôle `app_runtime`, PAS `postgres`
 * — voir drizzle/manual/0061_app_runtime_role_and_rls_gaps.sql : la
 * connexion `postgres` de production a BYPASSRLS et rendrait ces assertions
 * silencieusement fausses-positives).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, users, mutuelleGroups, mutuelleCatalogItems, catalogPackages } from "@/lib/db/schema"
import { pgErrorCode } from "@/lib/db/pg-error"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

let execAgencyA = ""
let execAgencyB = ""
let groupA = ""
let groupB = ""
let directorAId = ""
let directorBId = ""
let packageA = ""
let catalogItemA = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  execAgencyA = randomUUID()
  execAgencyB = randomUUID()
  groupA = randomUUID()
  groupB = randomUUID()
  directorAId = randomUUID()
  directorBId = randomUUID()
  packageA = randomUUID()
  catalogItemA = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: execAgencyA, slug: `mut-cat-a-${execAgencyA}`, name: "Exec Agency A", agencyType: "ota" },
      { id: execAgencyB, slug: `mut-cat-b-${execAgencyB}`, name: "Exec Agency B", agencyType: "ota" },
    ])

    await tx.insert(mutuelleGroups).values([
      { id: groupA, slug: `mut-grp-a-${groupA}`, name: "Groupe Test A", executionAgencyId: execAgencyA, markupPercent: "10" },
      { id: groupB, slug: `mut-grp-b-${groupB}`, name: "Groupe Test B", executionAgencyId: execAgencyB, markupPercent: "5" },
    ])

    await tx.insert(users).values([
      {
        id: directorAId,
        agencyId: execAgencyA,
        email: `director-a-${directorAId}@test.local`,
        role: "mutuelle_director",
        status: "active",
        mutuelleGroupId: groupA,
      },
      {
        id: directorBId,
        agencyId: execAgencyB,
        email: `director-b-${directorBId}@test.local`,
        role: "mutuelle_director",
        status: "active",
        mutuelleGroupId: groupB,
      },
    ])

    await tx.insert(catalogPackages).values({
      id: packageA,
      agencyId: execAgencyA,
      code: `TEST-${packageA.slice(0, 8)}`,
      title: "Package Test Groupe A",
      slug: `test-package-${packageA}`,
      status: "published",
      channels: ["b2c"],
    })

    await tx.insert(mutuelleCatalogItems).values({
      id: catalogItemA,
      groupId: groupA,
      productType: "package",
      productId: packageA,
      addedByUserId: directorAId,
    })
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.groupId, groupA))
    await tx.delete(catalogPackages).where(eq(catalogPackages.id, packageA))
    await tx.delete(users).where(eq(users.id, directorAId))
    await tx.delete(users).where(eq(users.id, directorBId))
    await tx.delete(mutuelleGroups).where(eq(mutuelleGroups.id, groupA))
    await tx.delete(mutuelleGroups).where(eq(mutuelleGroups.id, groupB))
    await tx.delete(agencies).where(eq(agencies.id, execAgencyA))
    await tx.delete(agencies).where(eq(agencies.id, execAgencyB))
  })
})

function asGroup(groupId: string, agencyId: string, userId: string) {
  return { agencyId, userId, isSuperAdmin: false, mutuelleGroupId: groupId }
}

test("mutuelle_catalog_items : le groupe A voit son propre item de catalogue", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(asGroup(groupA, execAgencyA, directorAId), (tx) =>
    tx.select().from(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.groupId, groupA)),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.productId, packageA)
})

test("mutuelle_catalog_items : le groupe B ne voit JAMAIS le catalogue du groupe A (RLS, pas seulement le code)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(asGroup(groupB, execAgencyB, directorBId), (tx) =>
    tx.select().from(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.groupId, groupA)),
  )
  assert.equal(rows.length, 0, "le groupe B ne doit voir AUCUN item du catalogue du groupe A")
})

test("mutuelle_catalog_items : le groupe B ne peut pas insérer un item pour le groupe A (RLS with_check bloqué)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  let caught: unknown
  try {
    await withTenantContext(asGroup(groupB, execAgencyB, directorBId), (tx) =>
      tx.insert(mutuelleCatalogItems).values({
        groupId: groupA,
        productType: "package",
        productId: packageA,
        addedByUserId: directorBId,
      }),
    )
  } catch (err) {
    caught = err
  }
  assert.ok(caught, "l'INSERT doit être rejeté par la policy with_check (group_id = current_mutuelle_group_id())")
  // 42501 = insufficient_privilege, code Postgres réel émis par FORCE ROW
  // LEVEL SECURITY quand with_check échoue — voir lib/db/pg-error.ts pour
  // pourquoi err.message seul (DrizzleQueryError) ne l'expose pas.
  assert.equal(pgErrorCode(caught), "42501")
})

test("mutuelle_catalog_items : le groupe B ne peut ni modifier ni supprimer un item du groupe A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const updated = await withTenantContext(asGroup(groupB, execAgencyB, directorBId), (tx) =>
    tx
      .update(mutuelleCatalogItems)
      .set({ productId: randomUUID() })
      .where(eq(mutuelleCatalogItems.id, catalogItemA))
      .returning({ id: mutuelleCatalogItems.id }),
  )
  assert.equal(updated.length, 0, "aucune ligne affectée — RLS empêche même de CIBLER l'item du groupe A")

  const deleted = await withTenantContext(asGroup(groupB, execAgencyB, directorBId), (tx) =>
    tx.delete(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.id, catalogItemA)).returning({ id: mutuelleCatalogItems.id }),
  )
  assert.equal(deleted.length, 0, "le groupe B ne peut pas supprimer un item du groupe A")

  const [stillThere] = await withSystemContext((tx) =>
    tx.select({ id: mutuelleCatalogItems.id }).from(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.id, catalogItemA)),
  )
  assert.ok(stillThere, "l'item du groupe A n'a pas bougé")
})

test("catalog_packages : l'agence d'exécution B ne peut jamais lire le catalogue publié de l'agence A", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const rows = await withTenantContext(asGroup(groupB, execAgencyB, directorBId), (tx) =>
    tx.select().from(catalogPackages).where(eq(catalogPackages.agencyId, execAgencyA)),
  )
  assert.equal(rows.length, 0)
})

test("system context (cron/webhook de confiance) : accès cross-groupe toujours disponible, jamais bloqué par RLS", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [item] = await withSystemContext((tx) =>
    tx.select().from(mutuelleCatalogItems).where(eq(mutuelleCatalogItems.groupId, groupA)),
  )
  assert.ok(item, "system context doit voir l'item du groupe A")
})
