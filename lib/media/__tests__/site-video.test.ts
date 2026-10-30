/**
 * SITE-VIDEO-01 — vidéo Hero : validation, appartenance de la clé,
 * signature binaire (vraies vidéos générées par ffmpeg quand disponible),
 * lecture partielle locale et câblage (CSP, affichage public, admin).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  MAX_SITE_VIDEO_BYTES,
  hasVideoSignature,
  isOwnSiteVideoKey,
  mimeFromSiteVideoKey,
  siteVideoKey,
  validateSiteVideoRequest,
} from "../site-video"

const AGENCY = "11111111-2222-3333-4444-555555555555"
const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

test("validation de la demande d'envoi : type, taille", () => {
  assert.equal(
    validateSiteVideoRequest({ contentType: "video/mp4", size: 1000 }),
    null,
  )
  assert.equal(
    validateSiteVideoRequest({
      contentType: "video/webm",
      size: MAX_SITE_VIDEO_BYTES,
    }),
    null,
  )
  assert.equal(
    validateSiteVideoRequest({ contentType: "video/quicktime", size: 1000 }),
    "unsupported_video_type",
  )
  assert.equal(
    validateSiteVideoRequest({
      contentType: "video/mp4",
      size: MAX_SITE_VIDEO_BYTES + 1,
    }),
    "video_too_large",
  )
  assert.equal(
    validateSiteVideoRequest({ contentType: "video/mp4", size: 0 }),
    "empty_video",
  )
})

test("clé : propre à l'agence et à l'emplacement, pas de traversée", () => {
  const key = siteVideoKey(AGENCY, ID, "video/mp4")
  assert.equal(key, `site/${AGENCY}/hero-video/${ID}.mp4`)
  assert.ok(isOwnSiteVideoKey(AGENCY, key))
  assert.equal(mimeFromSiteVideoKey(key), "video/mp4")
  assert.ok(!isOwnSiteVideoKey("99999999-2222-3333-4444-555555555555", key))
  assert.ok(
    !isOwnSiteVideoKey(AGENCY, `site/${AGENCY}/hero-video/../logo/${ID}.mp4`),
  )
  assert.ok(!isOwnSiteVideoKey(AGENCY, `site/${AGENCY}/hero/${ID}.mp4`))
})

test("signature : un faux fichier renommé .mp4/.webm est refusé", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(!hasVideoSignature(png, "video/mp4"))
  assert.ok(!hasVideoSignature(png, "video/webm"))
  const html = new TextEncoder().encode("<html><script>")
  assert.ok(!hasVideoSignature(html, "video/mp4"))
})

test("signature : vraies vidéos MP4 et WebM (ffmpeg), type croisé refusé", (t) => {
  if (!hasFfmpeg()) return void t.skip("ffmpeg indisponible")
  const dir = mkdtempSync(path.join(tmpdir(), "site-video-"))
  const mp4 = path.join(dir, "t.mp4")
  const webm = path.join(dir, "t.webm")
  const src = [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=1:size=160x90:rate=5",
  ]
  execFileSync("ffmpeg", [...src, mp4])
  execFileSync("ffmpeg", [...src, "-c:v", "libvpx", webm])
  const mp4Head = new Uint8Array(readFileSync(mp4).subarray(0, 16))
  const webmHead = new Uint8Array(readFileSync(webm).subarray(0, 16))
  assert.ok(hasVideoSignature(mp4Head, "video/mp4"))
  assert.ok(hasVideoSignature(webmHead, "video/webm"))
  assert.ok(!hasVideoSignature(mp4Head, "video/webm"))
  assert.ok(!hasVideoSignature(webmHead, "video/mp4"))
})

test("lecture partielle (backend local) : seuls les premiers octets sont lus", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "media-local-"))
  process.env.MEDIA_STORAGE_BACKEND = "local"
  const cwd = process.cwd()
  process.chdir(root)
  try {
    const { readObjectHead } = await import("../storage")
    const key = siteVideoKey(AGENCY, ID, "video/webm")
    mkdirSync(path.join(root, ".media-local", path.dirname(key)), {
      recursive: true,
    })
    writeFileSync(
      path.join(root, ".media-local", key),
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6]),
    )
    const head = await readObjectHead(key, 4)
    assert.deepEqual(Array.from(head ?? []), [0x1a, 0x45, 0xdf, 0xa3])
    assert.equal(
      await readObjectHead(`site/${AGENCY}/hero-video/absent.webm`, 4),
      null,
    )
  } finally {
    process.chdir(cwd)
    delete process.env.MEDIA_STORAGE_BACKEND
  }
})

test("câblage : CSP media-src Supabase, vidéo masquée sur mobile et en mouvement réduit, champ admin", () => {
  const config = readFileSync("next.config.mjs", "utf8")
  assert.match(config, /`media-src \$\{cspMediaSrc\}`/)
  assert.match(config, /"https:\/\/\*\.supabase\.co"/)
  const engine = readFileSync("components/booking-engine.tsx", "utf8")
  assert.match(engine, /<video[\s\S]*?muted[\s\S]*?playsInline/)
  assert.match(engine, /hidden[^"]*motion-reduce:hidden[^"]*sm:block/)
  const admin = readFileSync("app/(internal)/admin/site/page.tsx", "utf8")
  assert.match(admin, /<SiteVideoField[\s\S]*?name="heroVideoUrl"/)
  const actions = readFileSync("lib/admin/public-site-actions.ts", "utf8")
  assert.match(actions, /export async function confirmSiteVideoUpload/)
  assert.match(actions, /storage\.remove\(\[key\]\)/)
})
