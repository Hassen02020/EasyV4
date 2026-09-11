/**
 * Media System — logique transactionnelle (lib/media/media-core.ts) contre
 * un Postgres réel. Même convention que lib/admin/__tests__/
 * inventory-locks-core.test.ts : se dégrade en `skip` sans DATABASE_URL/
 * Postgres local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { agencies, productMedia, type ProductMediaVariants } from "@/lib/db/schema"
import {
  reassignCoverAfterDelete,
  isValidReorderSet,
  setCoverAtomic,
  fetchProductMediaRows,
  fetchCoverMediaRows,
} from "../media-core"

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
  "Postgres local indisponible (DATABASE_URL) — voir lib/hotel-suppliers/tenant/__tests__/live-resolution.test.ts pour la procédure."

let agencyA = ""
let agencyB = ""
let productId = ""

function fakeVariants(key: string): ProductMediaVariants {
  return { original: `${key}/original.webp`, large: `${key}/large.webp`, medium: `${key}/medium.webp`, card: `${key}/card.webp`, thumbnail: `${key}/thumbnail.webp` }
}

async function insertMedia(
  tx: DrizzleTransaction,
  agencyId: string,
  prodId: string,
  sortOrder: number,
  isCover: boolean,
) {
  const key = `media/${agencyId}/omra/${prodId}/${randomUUID()}`
  const [row] = await tx
    .insert(productMedia)
    .values({
      agencyId,
      module: "omra",
      productId: prodId,
      storageKey: `${key}/original.webp`,
      variants: fakeVariants(key),
      originalFilename: "test.jpg",
      mimeType: "image/jpeg",
      fileSize: 1000,
      sortOrder,
      isCover,
    })
    .returning({ id: productMedia.id })
  return row!.id
}

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  productId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, name: "Media Test Agency A", agencyType: "ota", slug: `media-a-${agencyA.slice(0, 8)}` },
      { id: agencyB, name: "Media Test Agency B", agencyType: "ota", slug: `media-b-${agencyB.slice(0, 8)}` },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(productMedia).where(eq(productMedia.agencyId, agencyA))
    await tx.delete(productMedia).where(eq(productMedia.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("isValidReorderSet : accepte un réordonnancement complet, rejette un ensemble tronqué ou étranger", () => {
  assert.equal(isValidReorderSet(["a", "b", "c"], ["c", "a", "b"]), true)
  assert.equal(isValidReorderSet(["a", "b", "c"], ["a", "b"]), false, "liste tronquée doit être rejetée")
  assert.equal(isValidReorderSet(["a", "b", "c"], ["a", "b", "c", "d"]), false, "id étranger ajouté doit être rejeté")
  assert.equal(isValidReorderSet(["a", "b", "c"], ["a", "b", "x"]), false, "id étranger substitué doit être rejeté")
})

test("product_media : contrainte CHECK module — rejette un module hors omra/package/activity", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  await assert.rejects(
    withTenantContext(ctx, async (tx) => {
      await tx.insert(productMedia).values({
        agencyId: agencyA,
        // Module invalide volontaire (colonne varchar non typée en enum
        // Drizzle — voir lib/db/schema/media.ts) : vérifie que la contrainte
        // CHECK côté DB rejette bien ce qu'aucun type TS ne bloquerait.
        module: "hotel",
        productId,
        storageKey: "k",
        variants: fakeVariants("k"),
        originalFilename: "x.jpg",
        mimeType: "image/jpeg",
        fileSize: 100,
      })
    }),
  )
})

test("product_media : index unique partiel — une seule couverture par produit au niveau DB", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const localProductId = randomUUID()
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  await withTenantContext(ctx, (tx) => insertMedia(tx, agencyA, localProductId, 0, true))
  await assert.rejects(withTenantContext(ctx, (tx) => insertMedia(tx, agencyA, localProductId, 1, true)))
  await withSystemContext(async (tx) => {
    await tx.delete(productMedia).where(eq(productMedia.productId, localProductId))
  })
})

test("reassignCoverAfterDelete : scénario mission §17 — 5 images, cover=image3, delete image3 -> nouvelle couverture valide", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ids: string[] = []

  await withTenantContext(ctx, async (tx) => {
    for (let i = 0; i < 5; i++) ids.push(await insertMedia(tx, agencyA, productId, i, false))
    await setCoverAtomic(tx, "omra", productId, ids[2]!)
  })

  await withTenantContext(ctx, async (tx) => {
    await tx.delete(productMedia).where(eq(productMedia.id, ids[2]!))
    await reassignCoverAfterDelete(tx, "omra", productId)
  })

  const rows = await withTenantContext(ctx, (tx) => fetchProductMediaRows(tx, agencyA, "omra", productId))
  assert.equal(rows.length, 4)
  const cover = rows.find((r) => r.isCover)
  assert.ok(cover, "une couverture doit être réassignée")
  assert.equal(cover!.id, ids[0], "le premier média restant (sortOrder le plus bas) devient la couverture")
})

test("reassignCoverAfterDelete : suppression du dernier média -> zéro couverture, pas d'erreur", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const localProductId = randomUUID()
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const id = await withTenantContext(ctx, (tx) => insertMedia(tx, agencyA, localProductId, 0, true))

  await withTenantContext(ctx, async (tx) => {
    await tx.delete(productMedia).where(eq(productMedia.id, id))
    await reassignCoverAfterDelete(tx, "omra", localProductId)
  })

  const rows = await withTenantContext(ctx, (tx) => fetchProductMediaRows(tx, agencyA, "omra", localProductId))
  assert.equal(rows.length, 0)
})

test("setCoverAtomic : bascule la couverture sans jamais avoir deux couvertures vraies simultanément", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const localProductId = randomUUID()
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const [id1, id2] = await withTenantContext(ctx, async (tx) => [
    await insertMedia(tx, agencyA, localProductId, 0, true),
    await insertMedia(tx, agencyA, localProductId, 1, false),
  ])

  await withTenantContext(ctx, (tx) => setCoverAtomic(tx, "omra", localProductId, id2!))

  const rows = await withTenantContext(ctx, (tx) => fetchProductMediaRows(tx, agencyA, "omra", localProductId))
  const covers = rows.filter((r) => r.isCover)
  assert.equal(covers.length, 1)
  assert.equal(covers[0]!.id, id2)
  assert.equal(rows.find((r) => r.id === id1)!.isCover, false)
})

test("fetchProductMediaRows : respecte l'ordre sortOrder (mission §18)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const localProductId = randomUUID()
  const ctx: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ids = await withTenantContext(ctx, async (tx) => [
    await insertMedia(tx, agencyA, localProductId, 2, false),
    await insertMedia(tx, agencyA, localProductId, 0, false),
    await insertMedia(tx, agencyA, localProductId, 1, false),
  ])
  const rows = await withTenantContext(ctx, (tx) => fetchProductMediaRows(tx, agencyA, "omra", localProductId))
  assert.deepEqual(rows.map((r) => r.id), [ids[1], ids[2], ids[0]])
})

test("fetchCoverMediaRows : isolation tenant — ne renvoie jamais un média d'une autre agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const prodA = randomUUID()
  const prodB = randomUUID()
  const ctxA: TenantContext = { agencyId: agencyA, userId: "", isSuperAdmin: true }
  const ctxB: TenantContext = { agencyId: agencyB, userId: "", isSuperAdmin: true }

  await withTenantContext(ctxA, (tx) => insertMedia(tx, agencyA, prodA, 0, true))
  await withTenantContext(ctxB, (tx) => insertMedia(tx, agencyB, prodB, 0, true))

  const coversForA = await withTenantContext(ctxA, (tx) =>
    fetchCoverMediaRows(tx, agencyA, "omra", [prodA, prodB]),
  )
  assert.equal(coversForA.length, 1, "seul le produit de l'agence A doit apparaître, même si l'id du produit B est demandé")
  assert.equal(coversForA[0]!.productId, prodA)
})
