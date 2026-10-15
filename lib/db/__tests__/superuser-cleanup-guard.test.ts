/**
 * APP-RUNTIME-GRANTS-CI-01 — preuve que `cleanupAsSuperuser` refuse
 * réellement les cibles non sûres (pas seulement en théorie) : jamais un
 * no-op silencieux sans DATABASE_DIRECT_URL, jamais une exécution contre un
 * hôte non-localhost (DATABASE_DIRECT_URL peut légitimement pointer vers le
 * projet Supabase réel en développement local, voir lib/db/README.md),
 * jamais en NODE_ENV=production. Pas de guard réseau nécessaire ici : ce
 * fichier ne se connecte jamais réellement (le callback n'exécute aucune
 * requête tant que le test attend un throw), donc aucune convention
 * isDbAvailable()/skip — il tourne toujours, y compris en CI `test` sans
 * Postgres.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { cleanupAsSuperuser } from "../test-helpers/superuser-cleanup"

function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides)) saved[key] = process.env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("cleanupAsSuperuser : refuse sans DATABASE_DIRECT_URL (jamais un no-op silencieux)", async () => {
  await withEnv(
    { DATABASE_DIRECT_URL: undefined, NODE_ENV: "test" },
    async () => {
      await assert.rejects(
        () => cleanupAsSuperuser(async () => {}),
        /DATABASE_DIRECT_URL/,
      )
    },
  )
})

test("cleanupAsSuperuser : refuse un hôte non-localhost (ex. projet Supabase réel)", async () => {
  await withEnv(
    {
      DATABASE_DIRECT_URL:
        "postgresql://postgres:pw@db.crygnaichvlxavvbifqi.supabase.co:5432/postgres",
      NODE_ENV: "test",
    },
    async () => {
      await assert.rejects(
        () => cleanupAsSuperuser(async () => {}),
        /hôte .* non autorisé/,
      )
    },
  )
})

test("cleanupAsSuperuser : refuse une URL invalide", async () => {
  await withEnv(
    { DATABASE_DIRECT_URL: "not-a-url", NODE_ENV: "test" },
    async () => {
      await assert.rejects(
        () => cleanupAsSuperuser(async () => {}),
        /URL valide/,
      )
    },
  )
})

test("cleanupAsSuperuser : refuse en NODE_ENV=production même avec un hôte localhost", async () => {
  await withEnv(
    {
      DATABASE_DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/x",
      NODE_ENV: "production",
    },
    async () => {
      await assert.rejects(
        () => cleanupAsSuperuser(async () => {}),
        /NODE_ENV=production/,
      )
    },
  )
})

test("cleanupAsSuperuser : accepte localhost en environnement non-production et exécute le callback", async () => {
  await withEnv(
    {
      DATABASE_DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/x",
      NODE_ENV: "test",
    },
    async () => {
      let ran = false
      await cleanupAsSuperuser(async () => {
        ran = true
      })
      assert.equal(ran, true)
    },
  )
})
