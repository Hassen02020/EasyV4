/**
 * VAL-01 / E2-01 — Wiring invariants : activités à proximité sur la fiche hôtel.
 *
 * Gap fermé : aucun test ne vérifiait explicitement le câblage bout en bout
 * hotel page → fetchNearbyNetworkActivities → getCrossSellNetworkActivities →
 * NearbyActivities component → lien fiche activité.
 *
 * Les vérifications post-déploiement CAS-C attestaient l'existence des filtres
 * status="active" dans les 3 types de pages. Ici on prouve l'intégration
 * au niveau de la page hôtel spécifiquement.
 *
 * Tests statiques (readFileSync) — aucune DB, aucun runtime Next.js requis,
 * inclus dans `pnpm test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const hotelPage = read("app/(public)/[locale]/hotels/[id]/page.tsx")
const serverAction = read("lib/network/nearby-activities-action.ts")
const crossSell = read("lib/destinations/cross-sell.ts")
const component = read("components/attractions/nearby-activities.tsx")

// ─── Page hôtel → server action ──────────────────────────────────────────────

test("E2-01-01 : hotel page importe fetchNearbyNetworkActivities depuis lib/network/nearby-activities-action", () => {
  assert.match(
    hotelPage,
    /import\s*\{[^}]*fetchNearbyNetworkActivities[^}]*\}\s*from\s*["']@\/lib\/network\/nearby-activities-action["']/,
  )
})

test("E2-01-02 : hotel page importe NearbyActivities depuis components/attractions/nearby-activities", () => {
  assert.match(
    hotelPage,
    /import\s*\{[^}]*NearbyActivities[^}]*\}\s*from\s*["']@\/components\/attractions\/nearby-activities["']/,
  )
})

test("E2-01-03 : hotel page rend <NearbyActivities activities={nearbyNetworkActivities} />", () => {
  assert.match(
    hotelPage,
    /NearbyActivities\s+activities=\{nearbyNetworkActivities\}/,
  )
})

test("E2-01-04 : hotel page — useEffect guarded by cityName (pas d'appel sans ville)", () => {
  assert.match(hotelPage, /if\s*\(\s*!cityName\s*\)\s*return/)
  assert.match(hotelPage, /fetchNearbyNetworkActivities\s*\(\s*cityName\s*\)/)
})

// ─── Server action → getCrossSellNetworkActivities ────────────────────────────

test("E2-01-05 : fetchNearbyNetworkActivities délègue à getCrossSellNetworkActivities (pas de logique dupliquée)", () => {
  assert.match(serverAction, /getCrossSellNetworkActivities/)
  assert.match(
    serverAction,
    /return\s+getCrossSellNetworkActivities\s*\(\s*city\s*\)/,
  )
})

// ─── getCrossSellNetworkActivities → filtre status="active" ──────────────────

test('E2-01-06 : getCrossSellNetworkActivities filtre products.status = "active" (jamais de produit réseau inactif dans le cross-sell)', () => {
  const fnIdx = crossSell.indexOf("getCrossSellNetworkActivities")
  assert.ok(fnIdx > 0, "getCrossSellNetworkActivities doit exister dans cross-sell.ts")
  // Slice autour de la fonction (800 chars suffisent)
  const block = crossSell.slice(fnIdx, fnIdx + 900)
  assert.ok(
    block.includes('"active"'),
    'getCrossSellNetworkActivities doit filtrer status="active"',
  )
  // La contrainte doit porter sur products.status, pas juste un commentaire
  assert.ok(
    block.includes("products.status"),
    "Le filtre doit porter sur products.status",
  )
})

// ─── Composant NearbyActivities ───────────────────────────────────────────────

test("E2-01-07 : NearbyActivities retourne null si activities.length === 0 (garde état vide)", () => {
  assert.match(component, /activities\.length\s*===\s*0/)
  assert.match(component, /return null/)
})

test("E2-01-08 : NearbyActivities rend un lien vers la fiche activité (/attractions/[slug] ou href fourni)", () => {
  // Lien avec href d'abord, slug en fallback
  assert.match(component, /activity\.href/)
  assert.match(component, /\/attractions\//)
})
