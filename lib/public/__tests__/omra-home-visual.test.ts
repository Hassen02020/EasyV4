/**
 * OMRA-HOME-VISUAL-01 — le bloc Omra de l'accueil reprend le visuel du module
 * Omra géré depuis l'administration, jamais une image inventée, et mène à
 * la page Omra.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { pickOmraHomeImage } from "../module-nav"

const v = (
  moduleSlug: string,
  enabled: boolean,
  heroImageUrl: string | null,
) => ({ moduleSlug, enabled, sortOrder: 1, heroImageUrl })

test("visuel du module omraty activé → son image", () => {
  assert.equal(
    pickOmraHomeImage([
      v("hotels-tunisie", true, "https://x/h.jpg"),
      v("omraty", true, "https://x/omra.jpg"),
    ]),
    "https://x/omra.jpg",
  )
})

test("module désactivé, image vide ou absente, liste vide → aucune image (jamais un repli)", () => {
  assert.equal(pickOmraHomeImage([v("omraty", false, "https://x/o.jpg")]), null)
  assert.equal(pickOmraHomeImage([v("omraty", true, null)]), null)
  assert.equal(pickOmraHomeImage([v("omraty", true, "   ")]), null)
  assert.equal(pickOmraHomeImage([v("omra", true, "https://x/o.jpg")]), null)
  assert.equal(pickOmraHomeImage([]), null)
})

test("bloc d'accueil : image conditionnelle, lien vers /omra, aucune image en dur", () => {
  const src = readFileSync("components/omraty-section.tsx", "utf8")
  assert.match(src, /<Link href="\/omra">\{t\("decouvrir"\)\}<\/Link>/)
  assert.match(src, /\{imageUrl \? \(/)
  assert.doesNotMatch(src, /unsplash|\.svg|\.jpg|\.png|\/images\//)
  const page = readFileSync("app/(public)/[locale]/page.tsx", "utf8")
  assert.match(page, /<OmratySection imageUrl=\{pickOmraHomeImage\(modules\)\} \/>/)
})

test("libellés du bloc présents dans les trois langues", () => {
  for (const l of ["fr", "en", "ar"]) {
    const c = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).Common
    for (const k of ["omraTitle", "omraSubtitle", "decouvrir"])
      assert.ok(c[k]?.length > 0, `${l}.${k}`)
  }
})
