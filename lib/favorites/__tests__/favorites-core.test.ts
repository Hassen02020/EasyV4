/**
 * Favoris (Wishlist) — preuve live contre un Postgres réel (RLS incluse via
 * withTenantContext), même convention que
 * lib/hotel-suppliers/tenant/__tests__/live-resolution.test.ts : se dégrade
 * en `skip` sans DATABASE_URL/Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import { agencies, customerFavorites } from "@/lib/db/schema"
import { toggleFavoriteCore, listFavoritesCore, removeFavoriteCore } from "../favorites-core"

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir live-resolution.test.ts pour la procédure."

let agencyA = ""
let agencyB = ""
let userA = ""
let userB = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()
  userA = randomUUID()
  userB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "FAV Agency A", agencyType: "ota", slug: `fav-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "FAV Agency B", agencyType: "ota", slug: `fav-b-${agencyB.slice(0, 8)}` },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(customerFavorites).where(eq(customerFavorites.agencyId, agencyA))
    await tx.delete(customerFavorites).where(eq(customerFavorites.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

const snapshot = {
  title: "Hôtel Test",
  imageUrl: "https://example.com/img.jpg",
  location: "Hammamet",
  priceFrom: 250,
  currency: "TND",
  href: "/hotels/12345",
}

test("toggleFavoriteCore : ajoute puis retire (idempotent, jamais de doublon)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: userA, isSuperAdmin: true }

  const first = await withTenantContext(ctx, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, itemType: "hotel", itemRef: "12345", snapshot }),
  )
  assert.equal(first.favorited, true)

  const listed = await withTenantContext(ctx, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }))
  assert.equal(listed.length, 1)
  assert.equal(listed[0]!.title, "Hôtel Test")
  assert.equal(listed[0]!.itemRef, "12345")

  const second = await withTenantContext(ctx, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, itemType: "hotel", itemRef: "12345", snapshot }),
  )
  assert.equal(second.favorited, false)

  const listedAfterRemove = await withTenantContext(ctx, (tx) =>
    listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }),
  )
  assert.equal(listedAfterRemove.length, 0)
})

test("listFavoritesCore : jamais les favoris d'un autre utilisateur (même agence)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: userA, isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyA, userId: userB, isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, itemType: "hotel", itemRef: "aaa", snapshot }),
  )
  await withTenantContext(ctxB, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userB, itemType: "hotel", itemRef: "bbb", snapshot }),
  )

  const listedA = await withTenantContext(ctxA, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }))
  const listedB = await withTenantContext(ctxB, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userB }))

  assert.equal(listedA.length, 1)
  assert.equal(listedA[0]!.itemRef, "aaa")
  assert.equal(listedB.length, 1)
  assert.equal(listedB[0]!.itemRef, "bbb")

  await withTenantContext(ctxA, (tx) => removeFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, id: listedA[0]!.id }))
  await withTenantContext(ctxB, (tx) => removeFavoriteCore(tx, { agencyId: agencyA, authUserId: userB, id: listedB[0]!.id }))
})

test("removeFavoriteCore : n'affecte jamais une ligne d'un autre utilisateur (id volé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: userA, isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, itemType: "activity", itemRef: "act-1", snapshot }),
  )
  const listed = await withTenantContext(ctxA, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }))
  assert.equal(listed.length, 1)
  const stolenId = listed[0]!.id

  // userB tente de retirer le favori de userA via son id — doit échouer
  // silencieusement (removed: false), jamais un accès croisé.
  const attempt = await withTenantContext(ctxA, (tx) =>
    removeFavoriteCore(tx, { agencyId: agencyA, authUserId: userB, id: stolenId }),
  )
  assert.equal(attempt.removed, false)

  const stillThere = await withTenantContext(ctxA, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }))
  assert.equal(stillThere.length, 1)

  await withTenantContext(ctxA, (tx) => removeFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, id: stolenId }))
})

test("customer_favorites_uniq : deux agences distinctes peuvent favoriser le même item indépendamment", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctxA: TenantContext = { agencyId: agencyA, userId: userA, isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: userA, isSuperAdmin: true }

  const resA = await withTenantContext(ctxA, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, itemType: "hotel", itemRef: "shared-99", snapshot }),
  )
  const resB = await withTenantContext(ctxB, (tx) =>
    toggleFavoriteCore(tx, { agencyId: agencyB, authUserId: userA, itemType: "hotel", itemRef: "shared-99", snapshot }),
  )
  assert.equal(resA.favorited, true)
  assert.equal(resB.favorited, true)

  const listA = await withTenantContext(ctxA, (tx) => listFavoritesCore(tx, { agencyId: agencyA, authUserId: userA }))
  const listB = await withTenantContext(ctxB, (tx) => listFavoritesCore(tx, { agencyId: agencyB, authUserId: userA }))
  assert.equal(listA.length, 1)
  assert.equal(listB.length, 1)

  await withTenantContext(ctxA, (tx) => removeFavoriteCore(tx, { agencyId: agencyA, authUserId: userA, id: listA[0]!.id }))
  await withTenantContext(ctxB, (tx) => removeFavoriteCore(tx, { agencyId: agencyB, authUserId: userA, id: listB[0]!.id }))
})
