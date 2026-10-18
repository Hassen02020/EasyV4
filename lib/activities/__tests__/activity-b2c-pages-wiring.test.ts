/**
 * ACTIVITY-B2C-FRONTEND-01 — invariants statiques sur les 4 pages publiques
 * B2C Activités créées dans ce chantier.
 *
 * Invariants protégés :
 *
 * 1. LISTING — arrayContains(channels, ["b2c"]) présent (jamais d'activité
 *    B2B exposée au catalogue public).
 * 2. LISTING — getDefaultAgencyId() scopé (jamais de catalogue multi-agences).
 * 3. LISTING — withSystemContext (trafic anonyme, pas de session).
 * 4. LISTING — force-dynamic (catalogue toujours frais).
 * 5. DETAIL — arrayContains(channels, ["b2c"]) présent.
 * 6. DETAIL — notFound() si activity non trouvée.
 * 7. BOOKING — notFound() si aucune session ouverte.
 * 8. BOOKING — ActivityGuestBookingForm importée depuis components/activities.
 * 9. BOOKING — sessions filtrées sur status="open" + date future (jamais de
 *    session passée présentée au visiteur).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const listingSrc = read("app/(public)/[locale]/activities/page.tsx")
const detailSrc = read("app/(public)/[locale]/activities/[slug]/page.tsx")
const bookSrc = read("app/(public)/[locale]/activities/[slug]/book/page.tsx")

// ─── Listing ─────────────────────────────────────────────────────────────────

test("ACTIVITY-B2C-PAGES-01 : listing — arrayContains channels b2c (jamais B2B exposé)", () => {
  assert.match(listingSrc, /arrayContains\s*\([\s\S]*channels[\s\S]*"b2c"/)
})

test("ACTIVITY-B2C-PAGES-02 : listing — getDefaultAgencyId (scopé à l'agence OTA)", () => {
  assert.match(listingSrc, /getDefaultAgencyId/)
})

test("ACTIVITY-B2C-PAGES-03 : listing — withSystemContext (trafic anonyme)", () => {
  assert.match(listingSrc, /withSystemContext/)
})

test("ACTIVITY-B2C-PAGES-04 : listing — force-dynamic (catalogue frais)", () => {
  assert.match(listingSrc, /force-dynamic/)
})

test("ACTIVITY-B2C-PAGES-05 : listing — prix depuis catalogActivitySessions (jamais inventé)", () => {
  assert.match(listingSrc, /catalogActivitySessions/)
  assert.match(listingSrc, /MIN\s*\(.*adultPriceTnd/)
})

// ─── Détail ───────────────────────────────────────────────────────────────────

test("ACTIVITY-B2C-PAGES-06 : détail — arrayContains channels b2c", () => {
  assert.match(detailSrc, /arrayContains\s*\([\s\S]*channels[\s\S]*"b2c"/)
})

test("ACTIVITY-B2C-PAGES-07 : détail — notFound() si activité absente", () => {
  assert.match(detailSrc, /notFound\(\)/)
})

test("ACTIVITY-B2C-PAGES-08 : détail — sessions filtrées : open + date future + capacityLeft > 0", () => {
  assert.match(detailSrc, /status.*open/)
  assert.match(detailSrc, /sessionDate/)
  assert.match(detailSrc, /capacityLeft\s*>\s*0/)
})

// ─── Réservation ─────────────────────────────────────────────────────────────

test("ACTIVITY-B2C-PAGES-09 : booking — ActivityGuestBookingForm importée depuis components/activities", () => {
  assert.match(
    bookSrc,
    /import.*ActivityGuestBookingForm.*from.*@\/components\/activities\/activity-guest-booking-form/,
  )
})

test("ACTIVITY-B2C-PAGES-10 : booking — notFound() si aucune session ouverte", () => {
  assert.match(bookSrc, /sessions\.length\s*===\s*0/)
  assert.match(bookSrc, /notFound\(\)/)
})

test("ACTIVITY-B2C-PAGES-11 : booking — sessions filtrées : open + date future + capacityLeft > 0 (jamais session passée)", () => {
  assert.match(bookSrc, /status.*open/)
  assert.match(bookSrc, /sessionDate/)
  assert.match(bookSrc, /capacityLeft\s*>\s*0/)
})

test("ACTIVITY-B2C-PAGES-12 : booking — prix réels (adultPriceTnd) lus depuis session DB (jamais fournis par client)", () => {
  assert.match(bookSrc, /parseFloat\s*\(\s*s\.adultPriceTnd\s*\)/)
})

test("ACTIVITY-B2C-PAGES-13 : booking — CAMPAIGN-LINK-01 — campaignId propagé", () => {
  assert.match(bookSrc, /campaign/)
  assert.match(bookSrc, /campaignId/)
})
