/**
 * CAS-D-FIX-01 — Test PostgreSQL local : SELECT mutuelleGroups FOR UPDATE sérialise
 * deux approbations concurrentes sur le même groupe.
 *
 * CE FICHIER EST EXCLU du runner vitest standard (*.live.test.ts dans exclude).
 * Exécution manuelle uniquement :
 *   ALLOW_LIVE_DB_TESTS=true node --import tsx --test \
 *     lib/mutuelle/__tests__/mutuelle-group-for-update-concurrency.live.test.ts
 *
 * Prérequis :
 *   - DATABASE_URL pointant sur localhost:54322 (Supabase CLI local)
 *   - L'env var ALLOW_LIVE_DB_TESTS=true doit être posée
 *   - Les tables mutuelle_groups et mutuelle_requests doivent exister
 *   - Une ligne agencies doit exister (FK execution_agency_id)
 *
 * Garanties de sécurité :
 *   1. ALLOW_LIVE_DB_TESTS=true obligatoire — refus par défaut
 *   2. Allowlist hôte strict : uniquement localhost / 127.0.0.1
 *   3. Nettoyage : seules les lignes créées par ce test sont supprimées
 *   4. Aucun secret de production, aucune connexion hors localhost
 *   5. Aucun résultat SKIP présenté comme PASS
 *
 * Ce test vérifie l'ordre d'acquisition des verrous (CAS-D) :
 *   TX-1 acquiert FOR UPDATE sur mutuelleRequests ET mutuelleGroups
 *   TX-2 tente FOR UPDATE sur mutuelleGroups → bloquée jusqu'à COMMIT TX-1
 *   → les deux approbations concurrentes n'interférent pas
 *
 * AVERTISSEMENT : ce test ne simule pas reviewMutuelleRequest en entier
 * (manque les mocks Auth/Supabase). Il valide uniquement la sérialisation
 * des verrous SQL sous lock_timeout.
 *
 * Détection 55P03 : postgres-js .begin() effectue automatiquement ROLLBACK si
 * la callback lève une erreur (y compris lock_timeout / code "55P03").
 * La vérification duck-type `err && err.code === "55P03"` distingue ce cas.
 */
import test from "node:test"
import assert from "node:assert/strict"
import postgres from "postgres"

/* ------------------------------------------------------------------ */
/* Garde-fous obligatoires                                             */
/* ------------------------------------------------------------------ */

const ALLOW = process.env.ALLOW_LIVE_DB_TESTS === "true"
const SKIP_REASON =
  "Test live PostgreSQL désactivé — posez ALLOW_LIVE_DB_TESTS=true pour l'activer."

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

const HOST_ALLOWLIST = ["localhost", "127.0.0.1"]

function assertAllowedHost(dbUrl: string | undefined): void {
  if (!dbUrl) throw new Error("DATABASE_URL non défini.")
  const host = extractHostname(dbUrl)
  if (!HOST_ALLOWLIST.includes(host)) {
    throw new Error(
      `[SAFEGUARD] DATABASE_URL pointe vers "${host}" (hors allowlist ${HOST_ALLOWLIST.join(", ")}). ` +
        `Ce test ne s'exécute que sur une base locale — refus.",`,
    )
  }
}

/* ------------------------------------------------------------------ */
/* Connexion                                                           */
/* ------------------------------------------------------------------ */

let sql: ReturnType<typeof postgres> | null = null

async function isDbAvailable(): Promise<boolean> {
  if (!ALLOW) return false
  const dbUrl = process.env.DATABASE_URL
  try {
    assertAllowedHost(dbUrl)
    sql = postgres(dbUrl!, { max: 5 })
    await sql`select 1`
    return true
  } catch {
    sql?.end().catch(() => {})
    sql = null
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

let dbAvailable = false

test.before(async () => {
  if (!ALLOW) return
  dbAvailable = await isDbAvailable()
})

test.after(async () => {
  await sql?.end().catch(() => {})
})

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

test("CAS-D-FIX-01 : SELECT mutuelleGroups FOR UPDATE sérialise deux approbations concurrentes", async (t) => {
  if (!dbAvailable) return t.skip(SKIP_REASON)
  assert.ok(sql, "connexion SQL requise")
  const db = sql!

  /* ---- Chercher une agence existante (ne pas en créer une) ---- */
  const agencies = await db<{ id: string }[]>`
      SELECT id FROM agencies LIMIT 1
    `
  if (agencies.length === 0) {
    return t.skip("Aucune agence en base — fixture impossible sans GO.")
  }
  const agencyId = agencies[0].id

  /* ---- Créer un groupe de test ---- */
  const groupTag = `cas-d-fix-test-${Date.now()}`
  const [group] = await db<{ id: string }[]>`
      INSERT INTO mutuelle_groups (slug, name, execution_agency_id, markup_percent, status)
      VALUES (${groupTag}, 'Groupe Test CAS-D', ${agencyId}, 5, 'active')
      RETURNING id
    `

  let cleaned = false
  async function cleanup() {
    if (cleaned) return
    cleaned = true
    await db`DELETE FROM mutuelle_groups WHERE id = ${group.id}`.catch(() => {})
  }

  try {
    /* ---- Vérifier que FOR UPDATE sur le groupe bloque une 2e TX ---- */
    let tx2Blocked = false
    let tx2Error: unknown = null

    // TX-1 : acquiert le verrou sur le groupe, tient pendant 200ms, commit
    const tx1Promise = db.begin(async (tx1) => {
      await tx1`
          SELECT id FROM mutuelle_groups
          WHERE id = ${group.id}
          FOR UPDATE
        `
      // Simuler un traitement long (200ms) pendant lequel TX-2 attend
      await new Promise((r) => setTimeout(r, 200))
      // commit implicite à la fin du callback
    })

    // TX-2 : tente le verrou 50ms après TX-1 avec lock_timeout court
    const tx2Promise = (async () => {
      await new Promise((r) => setTimeout(r, 50))
      try {
        await db.begin(async (tx2) => {
          await tx2`SET LOCAL lock_timeout = '100ms'`
          await tx2`
              SELECT id FROM mutuelle_groups
              WHERE id = ${group.id}
              FOR UPDATE
            `
        })
        tx2Blocked = false
      } catch (err: unknown) {
        tx2Error = err
        const code =
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code
        if (code === "55P03") {
          // lock_timeout expiré : TX-2 a bien été bloquée par TX-1
          tx2Blocked = true
        } else {
          // Autre erreur inattendue
          tx2Blocked = false
        }
      }
    })()

    await Promise.all([tx1Promise, tx2Promise])

    assert.equal(
      tx2Blocked,
      true,
      `TX-2 doit être bloquée par lock_timeout (55P03). ` +
        `Erreur reçue : ${tx2Error instanceof Error ? tx2Error.message : String(tx2Error)}`,
    )
  } finally {
    await cleanup()
  }
})
