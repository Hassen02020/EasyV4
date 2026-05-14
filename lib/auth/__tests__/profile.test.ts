/**
 * Tests unitaires `getCurrentAdminProfile`.
 *
 *   pnpm test
 *
 * Quand la BDD n'est pas configurée (env DATABASE_URL absent), la fonction
 * doit retourner `null` sans throw — c'est ce qui permet au layout admin
 * de retomber sur l'email Supabase brut sans crash.
 */

import test from "node:test"
import assert from "node:assert/strict"

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL

async function importFresh() {
  const path = "../profile.ts"
  return import(`${path}?t=${Date.now()}`)
}

test("getCurrentAdminProfile renvoie null si DATABASE_URL absent", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    const profile = await mod.getCurrentAdminProfile(
      "00000000-0000-0000-0000-aaaaaaaaaaaa",
    )
    assert.equal(profile, null)
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})

test("getCurrentAdminProfile renvoie null si userId vide", async () => {
  delete process.env.DATABASE_URL
  try {
    const mod = await importFresh()
    assert.equal(await mod.getCurrentAdminProfile(""), null)
    assert.equal(
      await mod.getCurrentAdminProfile(null as unknown as string),
      null,
    )
    assert.equal(
      await mod.getCurrentAdminProfile(undefined as unknown as string),
      null,
    )
  } finally {
    if (ORIGINAL_DATABASE_URL) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL
    }
  }
})
