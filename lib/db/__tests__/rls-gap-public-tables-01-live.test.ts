/**
 * RLS-GAP-PUBLIC-TABLES-01 — preuve live contre un Postgres réel, même
 * convention que lib/public/__tests__/public-visual-rls-role-gap-live.test.ts.
 *
 * Régression : `canonical_hotels`, `canonical_hotel_supplier_mappings` et
 * `development_project_waitlist` avaient RLS entièrement désactivée en
 * production ET des grants `anon`/`authenticated` (SELECT/INSERT/UPDATE/
 * DELETE) hérités d'un défaut de schéma Supabase — jamais demandés par
 * aucune migration de ce dépôt. `drizzle/manual/0120_rls_gap_public_tables_01.sql`
 * active RLS + une policy `TO app_runtime USING true` sur les 3 tables et
 * révoque tout privilège `anon`/`authenticated`, sans toucher aux grants
 * `app_runtime` ni introduire de scoping agence/tenant (aucune des 3 tables
 * n'en a — voir l'en-tête de 0109/0096).
 *
 * Ce test prouve simultanément, contre le `DATABASE_URL` réel de
 * l'environnement (jamais une connexion superuser/bypass RLS) :
 *   - app_runtime continue de lire/écrire les 3 tables (aucune régression) ;
 *   - anon/authenticated n'ont plus AUCUN privilège sur les 3 tables
 *     (`has_table_privilege`, vérifié pour les 4 opérations) ;
 *   - RLS est bien activée (`pg_class.relrowsecurity`/`relforcerowsecurity`).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  canonicalHotels,
  canonicalHotelSupplierMappings,
  developmentProjectWaitlist,
} from "@/lib/db/schema"
import { submitWaitlistEntry } from "@/lib/market/waitlist-actions"

/**
 * Fixture-only : `development_projects` a ses propres policies RLS
 * (`TO authenticated`, migration 0094) non concernées par ce chantier — un
 * gap structurellement identique à PUBLIC-VISUAL-RLS-ROLE-GAP-01, repéré
 * en écrivant ce test, mais explicitement hors scope ici (GO limité aux 3
 * tables de RLS-GAP-PUBLIC-TABLES-01 ; voir docs/ROADMAP.md pour le
 * signalement séparé). `app_runtime` ne peut donc pas lui-même créer la
 * ligne parent requise par la FK de `development_project_waitlist` — ce
 * fixture utilise exclusivement `DATABASE_DIRECT_URL` (rôle superuser du
 * conteneur Postgres de test, jamais utilisé pour les assertions
 * elles-mêmes) pour contourner UNIQUEMENT la création de ce prérequis,
 * jamais pour tester `development_project_waitlist`.
 */
async function createDevelopmentProjectFixtureAsSuperuser(): Promise<
  string | null
> {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return null
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into development_projects (source_url, published_at, confidence, name)
      values ('https://example.test/rls-gap-01', now(), 'HIGH', 'RLS-GAP-01 fixture project')
      returning id
    `
    return row?.id ?? null
  } finally {
    await sql.end()
  }
}

async function deleteDevelopmentProjectFixtureAsSuperuser(
  id: string,
): Promise<void> {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    await sql`delete from development_projects where id = ${id}`
  } finally {
    await sql.end()
  }
}

/**
 * `app_runtime` n'a jamais eu DELETE sur `canonical_hotel_supplier_mappings`
 * ni sur `canonical_hotels` (0109 : "jamais réécrite/supprimée après
 * coup" — append-only par design, confirmé inchangé par ce chantier).
 * Le nettoyage de fixture doit donc lui aussi passer par le superuser —
 * jamais par un chemin applicatif qui n'existe pas en production.
 */
async function deleteCanonicalHotelFixtureAsSuperuser(
  canonicalHotelId: string,
): Promise<void> {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    await sql`delete from canonical_hotel_supplier_mappings where canonical_hotel_id = ${canonicalHotelId}`
    await sql`delete from canonical_hotels where id = ${canonicalHotelId}`
  } finally {
    await sql.end()
  }
}

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

const TABLES = [
  "canonical_hotels",
  "canonical_hotel_supplier_mappings",
  "development_project_waitlist",
] as const
const PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const

before(async () => {
  dbAvailable = await isDbAvailable()
})

test("app_runtime : RLS activée + FORCE sur les 3 tables (aucune régression de visibilité pour le rôle réel)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const rows = await withSystemContext((tx) =>
    tx.execute(sql`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in (${TABLES[0]}, ${TABLES[1]}, ${TABLES[2]})
      order by relname
    `),
  )

  assert.equal(rows.length, 3, "les 3 tables doivent exister")
  for (const row of rows as unknown as Array<{
    relname: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>) {
    assert.equal(
      row.relrowsecurity,
      true,
      `${row.relname} : RLS doit être activée`,
    )
    assert.equal(
      row.relforcerowsecurity,
      true,
      `${row.relname} : FORCE ROW LEVEL SECURITY doit être activée`,
    )
  }
})

test("anon/authenticated : aucun privilège restant sur les 3 tables (SELECT/INSERT/UPDATE/DELETE)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  for (const table of TABLES) {
    for (const role of ["anon", "authenticated"] as const) {
      for (const privilege of PRIVILEGES) {
        const [row] = await withSystemContext((tx) =>
          tx.execute(
            sql`select has_table_privilege(${role}, ${table}, ${privilege}) as has_priv`,
          ),
        )
        assert.equal(
          (row as unknown as { has_priv: boolean }).has_priv,
          false,
          `${role} ne doit plus avoir ${privilege} sur ${table}`,
        )
      }
    }
  }
})

test("app_runtime : garde au minimum ses privilèges documentés (SELECT/INSERT/UPDATE sur canonical_hotels, SELECT/INSERT sur les mappings, SELECT/INSERT/UPDATE/DELETE sur la waitlist)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Vérifie uniquement la présence des privilèges documentés par 0109/0096
  // — jamais leur absence stricte : le job CI financial-e2e exécute, APRÈS
  // le replay des migrations, un GRANT large sur app_runtime (étape
  // "Grants finaux", .github/workflows/ci.yml) pour la convenance des
  // suites de test — un état plus permissif que la production, documenté
  // et accepté ailleurs dans ce dépôt (voir 0111, même constat). Ce
  // chantier ne touche QUE anon/authenticated ; app_runtime n'est jamais
  // resserré ici.
  const expected: Record<(typeof TABLES)[number], readonly string[]> = {
    canonical_hotels: ["SELECT", "INSERT", "UPDATE"],
    canonical_hotel_supplier_mappings: ["SELECT", "INSERT"],
    development_project_waitlist: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  }

  for (const table of TABLES) {
    for (const privilege of expected[table]) {
      const [row] = await withSystemContext((tx) =>
        tx.execute(
          sql`select has_table_privilege('app_runtime', ${table}, ${privilege}) as has_priv`,
        ),
      )
      assert.equal(
        (row as unknown as { has_priv: boolean }).has_priv,
        true,
        `app_runtime doit garder ${privilege} sur ${table}`,
      )
    }
  }
})

let canonicalHotelId = ""
let projectId = ""
const waitlistEmail = `rls-gap-01-${randomUUID()}@example.test`

after(async () => {
  if (!dbAvailable) return
  if (projectId) {
    await withSystemContext((tx) =>
      tx
        .delete(developmentProjectWaitlist)
        .where(eq(developmentProjectWaitlist.projectId, projectId)),
    )
    await deleteDevelopmentProjectFixtureAsSuperuser(projectId)
  }
  if (canonicalHotelId) {
    await deleteCanonicalHotelFixtureAsSuperuser(canonicalHotelId)
  }
})

test("app_runtime : canonical_hotels / canonical_hotel_supplier_mappings restent écrivables/lisibles après 0120", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  await withSystemContext(async (tx) => {
    const [created] = await tx
      .insert(canonicalHotels)
      .values({ name: "RLS-GAP-01 fixture", city: "Djerba", country: "TN" })
      .returning({ id: canonicalHotels.id })
    canonicalHotelId = created!.id

    await tx.insert(canonicalHotelSupplierMappings).values({
      canonicalHotelId,
      supplier: "rls_gap_01_fixture",
      supplierHotelCode: randomUUID(),
      matchConfidence: "EXACT",
      matchReasons: ["rls-gap-01 fixture"],
    })
  })

  const rows = await withSystemContext((tx) =>
    tx
      .select({ id: canonicalHotels.id })
      .from(canonicalHotels)
      .where(eq(canonicalHotels.id, canonicalHotelId)),
  )
  assert.equal(
    rows.length,
    1,
    "app_runtime doit toujours relire la ligne insérée",
  )
})

test("submitWaitlistEntry() reste fonctionnel pour app_runtime après 0120", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const fixtureProjectId = await createDevelopmentProjectFixtureAsSuperuser()
  if (!fixtureProjectId) {
    return t.skip(
      "DATABASE_DIRECT_URL indisponible — impossible de créer le prérequis development_projects (hors scope, voir en-tête du fichier).",
    )
  }
  projectId = fixtureProjectId

  const result = await submitWaitlistEntry({
    projectId,
    email: waitlistEmail,
    locale: "fr",
  })
  assert.deepEqual(result, { ok: true })

  const rows = await withSystemContext((tx) =>
    tx
      .select({ email: developmentProjectWaitlist.email })
      .from(developmentProjectWaitlist)
      .where(eq(developmentProjectWaitlist.projectId, projectId)),
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].email, waitlistEmail.toLowerCase())
})
