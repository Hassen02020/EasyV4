/** SITE-PROMO-BANNERS-01 — règles pures des promotions et garde /admin/brand. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  parseTunisLocalDateTime,
  promotionStatus,
  toTunisLocalInput,
  validatePromotionInput,
  type PromotionInput,
} from "../site-admin-core"

const base: PromotionInput = {
  title: "Omra",
  subtitle: null,
  destination: "La Mecque",
  moduleSlug: "omraty",
  href: "/omra",
  imageUrl: "https://example.test/o.webp",
  flag: null,
  enabled: true,
  sortOrder: 10,
  startsAt: null,
  endsAt: null,
}

test("dates saisies à l'heure de Tunis (UTC+1) ↔ instant UTC, aller-retour exact", () => {
  const d = parseTunisLocalDateTime("2027-03-10T09:30")!
  assert.equal(d.toISOString(), "2027-03-10T08:30:00.000Z")
  assert.equal(toTunisLocalInput(d), "2027-03-10T09:30")
  assert.equal(parseTunisLocalDateTime(""), null)
  assert.throws(() => parseTunisLocalDateTime("10/03/2027"), /INVALID_DATE/)
})

test("statut : même règle que le site public", () => {
  const now = new Date("2027-03-10T12:00:00Z")
  assert.equal(promotionStatus({ ...base }, now), "active")
  assert.equal(promotionStatus({ ...base, enabled: false }, now), "disabled")
  assert.equal(promotionStatus({ ...base, startsAt: new Date("2027-04-01T00:00:00Z") }, now), "scheduled")
  assert.equal(promotionStatus({ ...base, endsAt: new Date("2027-03-01T00:00:00Z") }, now), "expired")
})

test("validation : fin avant début, lien externe, image manquante refusés", () => {
  assert.throws(
    () =>
      validatePromotionInput({
        ...base,
        startsAt: new Date("2027-04-02T00:00:00Z"),
        endsAt: new Date("2027-04-01T00:00:00Z"),
      }),
    /END_BEFORE_START/,
  )
  assert.throws(() => validatePromotionInput({ ...base, href: "//evil.test" }), /INVALID_HREF/)
  assert.throws(() => validatePromotionInput({ ...base, imageUrl: "" }), /IMAGE_REQUIRED/)
  assert.doesNotThrow(() => validatePromotionInput(base))
})

test("/admin/brand : le rôle n'est plus lu dans la table inexistante user_profiles", () => {
  const src = readFileSync("lib/admin/brand-actions.ts", "utf8")
  assert.doesNotMatch(src, /from\("user_profiles"\)/)
  assert.match(src, /getCurrentAdminProfile\(user\.id\)/)
})

test("/admin/site : promotions et visuels écrits en contexte super admin, rôle vérifié", () => {
  const src = readFileSync("lib/admin/public-site-actions.ts", "utf8")
  assert.match(src, /ctx\.role !== "super_admin"/)
  const promoFn = src.slice(src.indexOf("export async function savePublicPromotion"))
  assert.match(promoFn, /isSuperAdmin: true/)
  const page = readFileSync("app/(internal)/admin/site/page.tsx", "utf8")
  assert.match(page, /listAdminPromotions\(\)/)
  assert.match(page, /name="startsAt"/)
  assert.match(page, /name="endsAt"/)
})
