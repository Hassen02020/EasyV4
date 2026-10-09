/**
 * ENV-VALIDATION-01 — Tests de la validation des variables d'environnement.
 */

import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { validateEnv } from "../env"

const ORIGINAL_ENV = { ...process.env }

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    DATABASE_URL: "postgres://postgres:pass@localhost:5432/test",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.test-service-role",
    PRICE_TOKEN_SECRET: "test-price-token-secret-16chars",
    SUPPLIER_CREDENTIALS_ENCRYPTION_KEY: "test-supplier-creds-encryption-key",
    CRON_SECRET: "test-cron-secret-16chars-minimum",
    NODE_ENV: "test",
  }

  for (const [key, value] of Object.entries(base)) {
    if (!(key in overrides)) process.env[key] = value
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
})

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, ORIGINAL_ENV)
})

describe("validateEnv()", () => {
  it("ne lève pas d'erreur avec toutes les variables critiques présentes", () => {
    setEnv()
    assert.doesNotThrow(() => validateEnv())
  })

  it("lève une erreur si DATABASE_URL est absent", () => {
    setEnv({ DATABASE_URL: undefined })
    assert.throws(() => validateEnv(), /DATABASE_URL/)
  })

  it("lève une erreur si NEXT_PUBLIC_SUPABASE_URL est absent", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined })
    assert.throws(() => validateEnv(), /NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("lève une erreur si NEXT_PUBLIC_SUPABASE_URL n'est pas une URL valide", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })
    assert.throws(() => validateEnv(), /NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("lève une erreur si SUPABASE_SERVICE_ROLE_KEY est absent", () => {
    setEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })
    assert.throws(() => validateEnv(), /SUPABASE_SERVICE_ROLE_KEY/)
  })

  it("lève une erreur si PRICE_TOKEN_SECRET est trop court (< 16 chars)", () => {
    setEnv({ PRICE_TOKEN_SECRET: "short" })
    assert.throws(() => validateEnv(), /PRICE_TOKEN_SECRET/)
  })

  it("reporte toutes les erreurs dans un seul throw", () => {
    setEnv({ DATABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined })
    assert.throws(() => validateEnv(), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /DATABASE_URL/)
      assert.match(error.message, /SUPABASE_SERVICE_ROLE_KEY/)
      return true
    })
  })

  it("rejette les secrets exemple en production", () => {
    setEnv({
      NODE_ENV: "production",
      PRICE_TOKEN_SECRET: "price-token-dev-secret-not-for-prod",
    })
    assert.throws(() => validateEnv(), /PRICE_TOKEN_SECRET/)
  })

  it("accepte les secrets exemple hors production (dev/test)", () => {
    setEnv({
      NODE_ENV: "development",
      PRICE_TOKEN_SECRET: "price-token-dev-secret-not-for-prod",
    })
    assert.doesNotThrow(() => validateEnv())
  })

  it("ne lève pas d'erreur si EXCHANGE_RATE_API_KEY est absent (warning seulement)", () => {
    setEnv({ EXCHANGE_RATE_API_KEY: undefined })
    assert.doesNotThrow(() => validateEnv())
  })

  it("ne lève pas d'erreur si RESEND_API_KEY est absent (warning seulement)", () => {
    setEnv({ RESEND_API_KEY: undefined })
    assert.doesNotThrow(() => validateEnv())
  })
})
