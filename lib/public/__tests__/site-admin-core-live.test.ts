/**
 * SITE-PROMO-BANNERS-01 — preuve live (Postgres réel, rôle app_runtime, RLS
 * forcée comme en production). Se dégrade en `skip` sans base locale.
 *
 * Reproduit le bug de production : écriture des promotions / visuels de
 * modules avec isSuperAdmin: false → la mise à jour d'une promotion ne
 * touchait aucune ligne (sans erreur), le visuel était rejeté. Prouve le
 * correctif : contexte super admin → écriture effective ; une écriture qui
 * ne touche rien lève désormais une erreur ; l'admin voit les promotions
 * désactivées/expirées que le site public masque.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  publicModuleVisuals,
  publicPromotions,
} from "@/lib/db/schema"
import {
  listAdminPromotionsCore,
  promotionStatus,
  saveModuleVisualCore,
  savePromotionCore,
  type PromotionInput,
} from "../site-admin-core"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."
let agencyId = ""

const asStaff = <T>(superAdmin: boolean, fn: Parameters<typeof withTenantContext<T>>[1]) =>
  withTenantContext({ agencyId, userId: "", isSuperAdmin: superAdmin }, fn)

const promo = (over: Partial<PromotionInput> = {}): PromotionInput => ({
  title: "Djerba été",
  subtitle: null,
  destination: "Djerba",
  moduleSlug: "hotels-tunisie",
  href: "/hotels/search",
  imageUrl: "https://example.test/djerba.webp",
  flag: "-15%",
  enabled: true,
  sortOrder: 10,
  startsAt: null,
  endsAt: null,
  ...over,
})

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext((tx) =>
    tx.insert(agencies).values({
      id: agencyId,
      slug: `site-promo-${agencyId.slice(0, 8)}`,
      name: "SITE-PROMO-BANNERS-01 fixture",
      agencyType: "ota",
    }),
  )
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(publicPromotions).where(eq(publicPromotions.agencyId, agencyId))
    await tx.delete(publicModuleVisuals).where(eq(publicModuleVisuals.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("bug reproduit : sans contexte super admin, la mise à jour d'une promotion ne touche aucune ligne — elle lève désormais une erreur", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const id = await asStaff(true, (tx) => savePromotionCore(tx, agencyId, null, promo()))
  await assert.rejects(
    asStaff(false, (tx) =>
      savePromotionCore(tx, agencyId, id, promo({ title: "Modifiée" })),
    ),
    /PROMOTION_NOT_SAVED/,
  )
  const [row] = await asStaff(true, (tx) =>
    tx.select({ title: publicPromotions.title }).from(publicPromotions).where(eq(publicPromotions.id, id)),
  )
  assert.equal(row.title, "Djerba été")
})

test("correctif : en contexte super admin, création puis modification effectives (dates comprises)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const id = await asStaff(true, (tx) =>
    savePromotionCore(tx, agencyId, null, promo({ destination: "Djerba-2" })),
  )
  const startsAt = new Date("2027-06-01T08:00:00Z")
  const endsAt = new Date("2027-06-30T22:00:00Z")
  await asStaff(true, (tx) =>
    savePromotionCore(tx, agencyId, id, promo({
        title: "Djerba juin",
        destination: "Djerba-2",
        startsAt,
        endsAt,
      })),
  )
  const rows = await asStaff(false, (tx) => listAdminPromotionsCore(tx, agencyId))
  const saved = rows.find((r) => r.id === id)!
  assert.equal(saved.title, "Djerba juin")
  assert.equal(saved.startsAt?.toISOString(), startsAt.toISOString())
  assert.equal(promotionStatus(saved, new Date("2027-05-01T00:00:00Z")), "scheduled")
})

test("visuel de module : rejeté sans super admin (bug), enregistré avec", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const input = { moduleSlug: "omraty", heroImageUrl: "https://example.test/omra.webp", enabled: false, sortOrder: 30 }
  await assert.rejects(asStaff(false, (tx) => saveModuleVisualCore(tx, agencyId, input)))
  await asStaff(true, (tx) => saveModuleVisualCore(tx, agencyId, input))
  await asStaff(true, (tx) =>
    saveModuleVisualCore(tx, agencyId, { ...input, enabled: true }),
  )
  const [row] = await asStaff(false, (tx) =>
    tx.select().from(publicModuleVisuals).where(eq(publicModuleVisuals.agencyId, agencyId)),
  )
  assert.equal(row.enabled, true)
  assert.equal(row.heroImageUrl, "https://example.test/omra.webp")
})

test("une seule promotion par destination : erreur claire", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(
    asStaff(true, (tx) => savePromotionCore(tx, agencyId, null, promo())),
    /DESTINATION_ALREADY_USED/,
  )
})

test("l'admin voit les promotions désactivées et expirées (réactivables)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const off = await asStaff(true, (tx) =>
    savePromotionCore(tx, agencyId, null, promo({ title: "Off", destination: "Off", enabled: false })),
  )
  const old = await asStaff(true, (tx) =>
    savePromotionCore(tx, agencyId, null, promo({
      title: "Old",
        destination: "Old",
      startsAt: new Date("2020-01-01T00:00:00Z"),
      endsAt: new Date("2020-02-01T00:00:00Z"),
    })),
  )
  const rows = await asStaff(false, (tx) => listAdminPromotionsCore(tx, agencyId))
  assert.equal(promotionStatus(rows.find((r) => r.id === off)!), "disabled")
  assert.equal(promotionStatus(rows.find((r) => r.id === old)!), "expired")
})
