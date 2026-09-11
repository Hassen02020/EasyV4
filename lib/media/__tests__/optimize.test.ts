/**
 * Pipeline d'optimisation image — validation serveur + génération des
 * variantes (mission §9/§13). Images synthétiques générées par sharp
 * lui-même (jamais une vraie photo commerciale, mission §33) : landscape
 * haute résolution, portrait, sombre, claire, trop petite, contenu non-image.
 */
import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import {
  validateImageBuffer,
  generateMediaVariants,
  MediaValidationError,
  MEDIA_VARIANT_SPECS,
  MIN_DIMENSION_PX,
} from "../optimize"

async function makeJpeg(width: number, height: number, rgb: [number, number, number] = [100, 150, 200]) {
  return sharp({
    create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .jpeg({ quality: 92 })
    .toBuffer()
}

test("validateImageBuffer : image valide (landscape haute résolution) -> dimensions correctes", async () => {
  const buf = await makeJpeg(4000, 2667)
  const meta = await validateImageBuffer(buf, "image/jpeg")
  assert.equal(meta.width, 4000)
  assert.equal(meta.height, 2667)
  assert.equal(meta.mimeType, "image/jpeg")
})

test("validateImageBuffer : portrait -> dimensions correctes", async () => {
  const buf = await makeJpeg(1500, 2400)
  const meta = await validateImageBuffer(buf, "image/jpeg")
  assert.equal(meta.width, 1500)
  assert.equal(meta.height, 2400)
})

test("validateImageBuffer : image sombre / claire -> acceptées normalement", async () => {
  const dark = await makeJpeg(2000, 1500, [10, 10, 15])
  const bright = await makeJpeg(2000, 1500, [250, 248, 240])
  assert.ok((await validateImageBuffer(dark, "image/jpeg")).width === 2000)
  assert.ok((await validateImageBuffer(bright, "image/jpeg")).width === 2000)
})

test("validateImageBuffer : rejette une image trop petite (< MIN_DIMENSION_PX)", async () => {
  const buf = await makeJpeg(MIN_DIMENSION_PX - 10, MIN_DIMENSION_PX - 10)
  await assert.rejects(() => validateImageBuffer(buf, "image/jpeg"), (e: unknown) => {
    assert.ok(e instanceof MediaValidationError)
    assert.equal(e.code, "image_too_small")
    return true
  })
})

test("validateImageBuffer : rejette un fichier vide", async () => {
  await assert.rejects(() => validateImageBuffer(Buffer.alloc(0), "image/jpeg"), (e: unknown) => {
    assert.ok(e instanceof MediaValidationError)
    assert.equal(e.code, "empty_file")
    return true
  })
})

test("validateImageBuffer : rejette un mimeType non supporté", async () => {
  const buf = await makeJpeg(500, 500)
  await assert.rejects(() => validateImageBuffer(buf, "image/gif"), (e: unknown) => {
    assert.ok(e instanceof MediaValidationError)
    assert.equal(e.code, "unsupported_mime_type")
    return true
  })
})

test("validateImageBuffer : rejette un contenu non-image (mission §9 — jamais confiance dans le client)", async () => {
  const fakeBuffer = Buffer.from("ceci n'est pas une image, juste du texte")
  await assert.rejects(() => validateImageBuffer(fakeBuffer, "image/jpeg"), (e: unknown) => {
    assert.ok(e instanceof MediaValidationError)
    assert.equal(e.code, "corrupt_image")
    return true
  })
})

test("validateImageBuffer : rejette un contenu réel ne correspondant pas au mimeType déclaré (mime spoofing)", async () => {
  const realPng = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .png()
    .toBuffer()
  // Déclaré comme jpeg alors que le contenu réel est un png.
  await assert.rejects(() => validateImageBuffer(realPng, "image/jpeg"), (e: unknown) => {
    assert.ok(e instanceof MediaValidationError)
    assert.equal(e.code, "mime_mismatch")
    return true
  })
})

test("generateMediaVariants : génère les 4 variantes avec les dimensions attendues", async () => {
  const buf = await makeJpeg(4000, 2667)
  const variants = await generateMediaVariants(buf)

  assert.equal(Object.keys(variants).sort().join(","), "card,large,medium,thumbnail")

  // card/thumbnail : fit "cover" -> dimensions EXACTES imposées.
  assert.equal(variants.card.width, MEDIA_VARIANT_SPECS.card.width)
  assert.equal(variants.card.height, MEDIA_VARIANT_SPECS.card.height)
  assert.equal(variants.thumbnail.width, MEDIA_VARIANT_SPECS.thumbnail.width)
  assert.equal(variants.thumbnail.height, MEDIA_VARIANT_SPECS.thumbnail.height)

  // large/medium : fit "inside" -> tient dans la boîte, aspect ratio préservé.
  assert.ok(variants.large.width <= MEDIA_VARIANT_SPECS.large.width)
  assert.ok(variants.large.height <= MEDIA_VARIANT_SPECS.large.height)
  assert.ok(variants.medium.width <= MEDIA_VARIANT_SPECS.medium.width)
  assert.ok(variants.medium.height <= MEDIA_VARIANT_SPECS.medium.height)

  // Toutes les variantes doivent être significativement plus légères que
  // l'original (mission §29 : jamais servir l'original pour un usage carte).
  assert.ok(variants.card.buffer.byteLength < buf.byteLength)
  assert.ok(variants.thumbnail.buffer.byteLength < variants.card.buffer.byteLength)
})

test("generateMediaVariants : ne suramplifie jamais une image plus petite que la cible 'inside' (mission §13, pas de pixelisation artificielle)", async () => {
  // Original plus petit que la borne "large" (1920x1080).
  const buf = await makeJpeg(800, 600)
  const variants = await generateMediaVariants(buf)
  assert.ok(variants.large.width <= 800)
  assert.ok(variants.large.height <= 600)
})

test("generateMediaVariants : préserve l'aspect ratio en mode 'inside' (portrait)", async () => {
  const buf = await makeJpeg(1500, 2400) // ratio 0.625
  const variants = await generateMediaVariants(buf)
  const ratio = variants.large.width / variants.large.height
  assert.ok(Math.abs(ratio - 1500 / 2400) < 0.01)
})
