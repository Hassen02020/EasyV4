import test from "node:test"
import assert from "node:assert/strict"
import { withBrandSuffix } from "@/lib/seo/module-metadata"

test("ajoute la marque quand elle est absente", () => {
  assert.equal(
    withBrandSuffix("Réservez votre vol"),
    "Réservez votre vol | Easy2Book",
  )
})

test("ne double pas la marque déjà présente dans le titre", () => {
  assert.equal(
    withBrandSuffix("Découvrez le monde avec Easy2Book"),
    "Découvrez le monde avec Easy2Book",
  )
})

test("texte arabe : suffixe ajouté tel quel", () => {
  assert.equal(
    withBrandSuffix("احجز رحلتك الجوية"),
    "احجز رحلتك الجوية | Easy2Book",
  )
})
