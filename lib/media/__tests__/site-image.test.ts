/**
 * SITE-MEDIA-UPLOAD-01 — préparation des images du site public.
 * Images réelles générées par sharp (pas de fichier mocké).
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import sharp from "sharp"
import { MediaValidationError } from "../optimize"
import { isSiteImageSlot, prepareSiteImage, siteImageKey } from "../site-image"

function image(width: number, height: number, format: "png" | "jpeg") {
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 40, alpha: 0.5 },
    },
  })
  return format === "png" ? base.png().toBuffer() : base.jpeg().toBuffer()
}

test("logo : fichier original conservé (PNG transparent intact)", async () => {
  const png = await image(400, 400, "png")
  const out = await prepareSiteImage(png, "image/png", "logo")
  assert.equal(out.contentType, "image/png")
  assert.equal(out.ext, "png")
  assert.ok(out.buffer.equals(png))
})

test("hero : converti en WebP, réduit à 1920 px max sans agrandir", async () => {
  const big = await image(4000, 2000, "jpeg")
  const out = await prepareSiteImage(big, "image/jpeg", "hero")
  assert.equal(out.contentType, "image/webp")
  assert.equal(out.width, 1920)
  assert.equal(out.height, 960)
  assert.equal((await sharp(out.buffer).metadata()).format, "webp")

  const small = await image(800, 600, "jpeg")
  const kept = await prepareSiteImage(small, "image/jpeg", "promo")
  assert.equal(kept.width, 800)
})

test("refus serveur : type déclaré mensonger, image trop petite, format non accepté", async () => {
  const png = await image(400, 400, "png")
  await assert.rejects(
    prepareSiteImage(png, "image/jpeg", "hero"),
    (e) => e instanceof MediaValidationError && e.code === "mime_mismatch",
  )
  await assert.rejects(
    prepareSiteImage(await image(100, 100, "png"), "image/png", "logo"),
    (e) => e instanceof MediaValidationError && e.code === "image_too_small",
  )
  await assert.rejects(
    prepareSiteImage(Buffer.from("<svg/>"), "image/svg+xml", "logo"),
    (e) =>
      e instanceof MediaValidationError && e.code === "unsupported_mime_type",
  )
})

test("emplacements et clé de stockage", () => {
  assert.ok(isSiteImageSlot("logo"))
  assert.ok(!isSiteImageSlot("../etc"))
  assert.equal(
    siteImageKey("agency-1", "promo", "id-9", "webp"),
    "site/agency-1/promo/id-9.webp",
  )
})

test("réseaux sociaux : enregistrés aussi sur l'agence (signature email, footer)", () => {
  const src = readFileSync("lib/admin/public-site-actions.ts", "utf8")
  const agencyUpdate = src.slice(
    src.indexOf(".update(agencies)"),
    src.indexOf(".where(eq(agencies.id, ctx.agencyId))"),
  )
  for (const field of ["facebookUrl", "instagramUrl", "tiktokUrl"]) {
    assert.match(agencyUpdate, new RegExp(`\\b${field}\\b`))
  }
})

test("/admin/site : les 4 emplacements image utilisent l'envoi de fichier", () => {
  const page = readFileSync("app/(internal)/admin/site/page.tsx", "utf8")
  for (const slot of ["logo", "hero", "module", "promo"]) {
    assert.match(page, new RegExp(`slot="${slot}"`))
  }
  const action = readFileSync("lib/admin/public-site-actions.ts", "utf8")
  assert.match(action, /export async function uploadSiteImage/)
  assert.match(action, /assertProductManager\(\)/)
})
