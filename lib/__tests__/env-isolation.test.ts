import test from "node:test"
import assert from "node:assert/strict"
import {
  assertDeploymentIsolation,
  checkDeploymentIsolation,
  DEPLOYMENT_ISOLATION_REFUSED,
  resolveDeploymentEnvironment,
  supabaseRefFromApiUrl,
  supabaseRefFromDatabaseUrl,
} from "@/lib/env-isolation"

const PROD = "crygnaichvlxavvbifqi"
const PREV = "abcdefghijklmnopqrst"

const previewOk = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  PREVIEW_SUPABASE_PROJECT_REF: PREV,
  DATABASE_URL: `postgresql://postgres.${PREV}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${PREV}.supabase.co`,
}

test("extraction de la référence Supabase (pooler, direct, API)", () => {
  assert.equal(supabaseRefFromDatabaseUrl(previewOk.DATABASE_URL), PREV)
  assert.equal(
    supabaseRefFromDatabaseUrl(
      `postgresql://postgres:pw@db.${PREV}.supabase.co:5432/postgres`,
    ),
    PREV,
  )
  assert.equal(
    supabaseRefFromDatabaseUrl("postgresql://u:p@127.0.0.1:5432/x"),
    null,
  )
  assert.equal(supabaseRefFromDatabaseUrl("pas une url"), null)
  assert.equal(supabaseRefFromApiUrl(`https://${PREV}.supabase.co`), PREV)
})

test("environnement : VERCEL_ENV prime, NODE_ENV ignoré", () => {
  assert.equal(
    resolveDeploymentEnvironment({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    }),
    "preview",
  )
  assert.equal(resolveDeploymentEnvironment({ VERCEL: "1" }), "unknown")
  assert.equal(
    resolveDeploymentEnvironment({ VERCEL_ENV: "staging" }),
    "unknown",
  )
  assert.equal(
    resolveDeploymentEnvironment({ NODE_ENV: "production" }),
    "local",
  )
})

test("Preview + Supabase de Preview : autorisé", () => {
  assert.deepEqual(checkDeploymentIsolation(previewOk), [])
  assert.deepEqual(
    checkDeploymentIsolation({
      ...previewOk,
      PAYMEE_API_KEY: "k",
      PAYMEE_ENVIRONMENT: "sandbox",
    }),
    [],
  )
})

test("Preview + base ou Supabase de production : bloqué", () => {
  const errs = checkDeploymentIsolation({
    ...previewOk,
    DATABASE_URL: `postgresql://postgres.${PROD}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  })
  assert.ok(
    errs.some((e) =>
      e.startsWith("DATABASE_URL : référence le projet Supabase de PRODUCTION"),
    ),
  )
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    }).length > 0,
  )
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      PREVIEW_SUPABASE_PROJECT_REF: PROD,
    }).some((e) => e.includes("PRODUCTION")),
  )
  // référence de prod cachée hors du nom d'hôte (utilisateur sur hôte local)
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      DATABASE_URL: `postgresql://postgres.${PROD}:x@127.0.0.1:1/postgres`,
    }).length > 0,
  )
})

test("Preview + Paymee réel ou ambigu : bloqué", () => {
  assert.ok(
    checkDeploymentIsolation({ ...previewOk, PAYMEE_ENVIRONMENT: "production" })
      .length > 0,
  )
  assert.ok(
    checkDeploymentIsolation({ ...previewOk, PAYMEE_API_KEY: "k" }).length > 0,
    "clé sans mode explicite",
  )
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      PAYMEE_API_KEY: "k",
      PAYMEE_ENVIRONMENT: "sandbox",
      PAYMEE_BASE_URL: "https://app.paymee.tn",
    }).length > 0,
  )
  assert.ok(
    checkDeploymentIsolation({ ...previewOk, STRIPE_SECRET_KEY: "sk_live_x" })
      .length > 0,
  )
  assert.deepEqual(
    checkDeploymentIsolation({ ...previewOk, STRIPE_SECRET_KEY: "sk_test_x" }),
    [],
  )
  assert.ok(
    checkDeploymentIsolation({ ...previewOk, SPS_SECRET_KEY: "x" }).length > 0,
  )
})

test("Variables manquantes ou ambiguës : bloqué", () => {
  const { PREVIEW_SUPABASE_PROJECT_REF: _omit, ...noRef } = previewOk
  assert.ok(checkDeploymentIsolation(noRef).length > 0)
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      DATABASE_URL: "postgresql://u:p@db.example.com:5432/x",
    }).some((e) => e.includes("non identifiable")),
  )
  assert.ok(
    checkDeploymentIsolation({
      ...previewOk,
      DATABASE_URL: `postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    }).some((e) => e.includes("différent de PREVIEW_SUPABASE_PROJECT_REF")),
  )
  assert.deepEqual(checkDeploymentIsolation({ VERCEL: "1" }).length, 1)
})

test("Production et local : comportement existant préservé", () => {
  assert.deepEqual(
    checkDeploymentIsolation({
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_URL: `postgresql://postgres.${PROD}:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
      PAYMEE_API_KEY: "k",
      PAYMEE_ENVIRONMENT: "production",
    }),
    [],
  )
  assert.deepEqual(
    checkDeploymentIsolation({
      DATABASE_URL: "postgres://x:x@127.0.0.1:5432/x",
    }),
    [],
  )
})

test("aucun secret dans les messages d'erreur", () => {
  const secret = "S3cretPassw0rd"
  const errs = checkDeploymentIsolation({
    ...previewOk,
    DATABASE_URL: `postgresql://postgres.${PROD}:${secret}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    PAYMEE_API_KEY: "pk_secret_value",
    STRIPE_SECRET_KEY: "sk_live_secret",
  })
  assert.ok(errs.length > 0)
  for (const e of errs) {
    assert.ok(
      !e.includes(secret) &&
        !e.includes("pk_secret_value") &&
        !e.includes("sk_live_secret"),
      e,
    )
  }
})

test("assertDeploymentIsolation : lève sans secret, laisse passer si isolé", () => {
  const secret = "S3cretPassw0rd"
  assert.throws(
    () =>
      assertDeploymentIsolation({
        ...previewOk,
        DATABASE_URL: `postgresql://postgres.${PROD}:${secret}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
      }),
    (e: Error) =>
      e.message === DEPLOYMENT_ISOLATION_REFUSED && !e.message.includes(secret),
  )
  assert.doesNotThrow(() => assertDeploymentIsolation(previewOk))
  assert.doesNotThrow(() =>
    assertDeploymentIsolation({ DATABASE_URL: "postgres://x:x@127.0.0.1/x" }),
  )
})
