/**
 * CRM-LANDING-01 — landing pages de campagne : configuration, câblage de la
 * page et parité des textes FR/EN/AR.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { LANDING_PAGES, findLandingConfig } from "../landing-config"
import { LEAD_PRODUCT_TYPES } from "../leads-core"

const ROOT = path.resolve(__dirname, "../../..")
const PAGE = path.join(ROOT, "app/(public)/[locale]/landing/[slug]/page.tsx")

test("chaque type de prospect accepté en base a exactement une landing", () => {
  const types = LANDING_PAGES.map((l) => l.productType).sort()
  assert.deepEqual(types, [...LEAD_PRODUCT_TYPES].sort())
})

test("slugs uniques et au format URL", () => {
  const slugs = LANDING_PAGES.map((l) => l.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/)
})

test("slug connu → configuration ; inconnu → null (404)", () => {
  assert.equal(findLandingConfig("omra")?.productType, "omra")
  assert.equal(findLandingConfig("hotels")?.productType, "hotel")
  assert.equal(findLandingConfig("inconnu"), null)
  assert.equal(findLandingConfig(""), null)
  assert.equal(findLandingConfig("transfer"), null)
})

test("le lien « voir les offres » pointe vers une route publique existante", () => {
  for (const l of LANDING_PAGES) {
    const dir =
      l.listingHref === "/"
        ? path.join(ROOT, "app/(public)/[locale]")
        : path.join(ROOT, "app/(public)/[locale]", l.listingHref.slice(1))
    assert.ok(existsSync(path.join(dir, "page.tsx")), l.listingHref)
  }
})

test("page : 404 sur slug inconnu, non indexée, formulaire avec le type du slug", () => {
  const src = readFileSync(PAGE, "utf8")
  assert.match(src, /if \(!config\) notFound\(\)/)
  assert.match(src, /robots:\s*\{\s*index:\s*false/)
  assert.match(
    src,
    /<LeadCaptureForm[\s\S]*productType=\{config\.productType\}/,
  )
})

test("page : aucun prix ni montant codé en dur", () => {
  const src = readFileSync(PAGE, "utf8")
  assert.doesNotMatch(src, /\b(TND|DT|€|\$)\b|\d+\s*(TND|DT)/)
})

test("textes Landing présents et identiques en clés en FR/EN/AR", () => {
  const load = (l: string) =>
    JSON.parse(readFileSync(path.join(ROOT, `messages/${l}.json`), "utf8"))
      .Landing as Record<string, string>
  const fr = load("fr")
  const required = [
    "kicker",
    "benefit1",
    "benefit2",
    "benefit3",
    "formTitle",
    "browseOffers",
    ...LANDING_PAGES.flatMap((l) => [
      `${l.i18nKey}Title`,
      `${l.i18nKey}Subtitle`,
    ]),
  ]
  for (const k of required) assert.ok(fr[k]?.trim(), `fr.${k}`)
  for (const l of ["en", "ar"]) {
    const other = load(l)
    assert.deepEqual(Object.keys(other).sort(), Object.keys(fr).sort(), l)
    for (const k of required) assert.ok(other[k]?.trim(), `${l}.${k}`)
  }
})

test("textes Landing : aucun prix ni pourcentage de remise", () => {
  for (const l of ["fr", "en", "ar"]) {
    const landing = JSON.parse(
      readFileSync(path.join(ROOT, `messages/${l}.json`), "utf8"),
    ).Landing as Record<string, string>
    for (const [k, v] of Object.entries(landing)) {
      // Tout chiffre hors du nom de marque « Easy2Book » est suspect.
      assert.doesNotMatch(v.replaceAll("Easy2Book", ""), /\d/, `${l}.${k}`)
    }
  }
})
