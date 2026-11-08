import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const component = readFileSync(
  resolve(process.cwd(), "components/omraty-section.tsx"),
  "utf8",
)

const messages = {
  fr: JSON.parse(readFileSync(resolve(process.cwd(), "messages/fr.json"), "utf8")),
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  ar: JSON.parse(readFileSync(resolve(process.cwd(), "messages/ar.json"), "utf8")),
}

test("homepage Omra section displays a real Kaaba photo with responsive sizing", () => {
  assert.match(component, /images\.unsplash\.com\/photo-1591604129939-f1efa4d9f7fa/)
  assert.match(component, /alt=\{t\("omraImageAlt"\)\}/)
  assert.match(component, /sizes="\(max-width: 768px\) 100vw, 45vw"/)
  assert.match(component, /md:grid-cols-\[0\.95fr_1\.05fr\]/)
  assert.match(component, /min-h-56 sm:min-h-64 md:min-h-\[300px\]/)
})

test("homepage Omra section links its CTA to the Omra booking page", () => {
  assert.match(component, /<Link href="\/omra">\{t\("decouvrir"\)\}<\/Link>/)
})

test("Omra homepage copy and image alternative text exist in all supported languages", () => {
  for (const locale of ["fr", "en", "ar"] as const) {
    const common = messages[locale].Common
    assert.ok(common.omraTitle, locale + ": missing Omra title")
    assert.ok(common.omraSubtitle, locale + ": missing Omra subtitle")
    assert.ok(common.omraImageAlt, locale + ": missing accessible image alt")
    assert.ok(common.decouvrir, locale + ": missing CTA label")
  }
})
