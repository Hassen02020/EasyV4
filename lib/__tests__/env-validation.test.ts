/**
 * ENV-VALIDATION-01 — Tests de la validation des variables d'environnement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

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
  for (const [k, v] of Object.entries(base)) {
    if (!(k in overrides)) process.env[k] = v
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

beforeEach(() => {
  vi.resetModules()
  Object.keys(process.env).forEach((k) => delete process.env[k])
})

afterEach(() => {
  Object.keys(process.env).forEach((k) => delete process.env[k])
  Object.assign(process.env, ORIGINAL_ENV)
})

async function importFresh() {
  const { validateEnv } = await import("../env")
  return validateEnv
}

describe("validateEnv()", () => {
  it("ne lève pas d'erreur avec toutes les variables critiques présentes", async () => {
    setEnv()
    const validateEnv = await importFresh()
    expect(() => validateEnv()).not.toThrow()
  })

  it("lève une erreur si DATABASE_URL est absent", async () => {
    setEnv({ DATABASE_URL: undefined })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/DATABASE_URL/)
  })

  it("lève une erreur si NEXT_PUBLIC_SUPABASE_URL est absent", async () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("lève une erreur si NEXT_PUBLIC_SUPABASE_URL n'est pas une URL valide", async () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("lève une erreur si SUPABASE_SERVICE_ROLE_KEY est absent", async () => {
    setEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it("lève une erreur si PRICE_TOKEN_SECRET est trop court (< 16 chars)", async () => {
    setEnv({ PRICE_TOKEN_SECRET: "short" })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/PRICE_TOKEN_SECRET/)
  })

  it("reporte toutes les erreurs dans un seul throw", async () => {
    setEnv({ DATABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined })
    const validateEnv = await importFresh()
    // Les deux clés manquantes doivent apparaître dans le même message
    expect(() => validateEnv()).toThrow(/DATABASE_URL/)
  })

  it("rejette les secrets exemple en production", async () => {
    setEnv({
      NODE_ENV: "production",
      PRICE_TOKEN_SECRET: "price-token-dev-secret-not-for-prod",
    })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).toThrow(/PRICE_TOKEN_SECRET/)
  })

  it("accepte les secrets exemple hors production (dev/test)", async () => {
    setEnv({
      NODE_ENV: "development",
      PRICE_TOKEN_SECRET: "price-token-dev-secret-not-for-prod",
    })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).not.toThrow()
  })

  it("ne lève pas d'erreur si EXCHANGE_RATE_API_KEY est absent (warning seulement)", async () => {
    setEnv({ EXCHANGE_RATE_API_KEY: undefined })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).not.toThrow()
  })

  it("ne lève pas d'erreur si RESEND_API_KEY est absent (warning seulement)", async () => {
    setEnv({ RESEND_API_KEY: undefined })
    const validateEnv = await importFresh()
    expect(() => validateEnv()).not.toThrow()
  })
})
