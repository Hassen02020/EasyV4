import test from "node:test"
import assert from "node:assert/strict"
import {
  PUBLIC_MODULES,
  getVisiblePublicModules,
} from "@/lib/public/module-nav"

const ids = (list: readonly { id: string }[]) => list.map((m) => m.id)

test("liste vide (DB indisponible) → les 8 modules, ordre de référence", () => {
  assert.deepEqual(ids(getVisiblePublicModules([])), ids(PUBLIC_MODULES))
  assert.equal(PUBLIC_MODULES.length, 8)
})

test("module désactivé → absent", () => {
  const visible = getVisiblePublicModules([
    { moduleSlug: "hotels-tunisie", enabled: true },
    { moduleSlug: "vols", enabled: false },
    { moduleSlug: "omraty", enabled: true },
  ])
  assert.deepEqual(ids(visible), ["hotels-tunisie", "omraty"])
})

test("ordre de PUBLIC_MODULES conservé, pas l'ordre des lignes DB", () => {
  const visible = getVisiblePublicModules([
    { moduleSlug: "car", enabled: true },
    { moduleSlug: "hotels-monde", enabled: true },
  ])
  assert.deepEqual(ids(visible), ["hotels-monde", "car"])
})

test("tous désactivés → repli sur les 8 modules (comportement historique du moteur)", () => {
  const visible = getVisiblePublicModules(
    PUBLIC_MODULES.map((m) => ({ moduleSlug: m.id, enabled: false })),
  )
  assert.deepEqual(ids(visible), ids(PUBLIC_MODULES))
})

test("slug inconnu ignoré", () => {
  const visible = getVisiblePublicModules([
    { moduleSlug: "inconnu", enabled: true },
    { moduleSlug: "attractions", enabled: true },
  ])
  assert.deepEqual(ids(visible), ["attractions"])
})

test("routes attendues par module", () => {
  assert.deepEqual(
    Object.fromEntries(PUBLIC_MODULES.map((m) => [m.id, m.href])),
    {
      "hotels-tunisie": "/hotels",
      "hotels-monde": "/hotels-monde",
      omraty: "/omra",
      "voyages-organises": "/packages",
      attractions: "/attractions",
      vols: "/vols",
      transferts: "/transferts",
      car: "/car",
    },
  )
})
