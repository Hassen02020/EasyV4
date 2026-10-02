/**
 * DISTRIBUTION-01 — invariants statiques sur
 * `lib/b2b/authorized-products.ts` et `components/pro/authorized-products-list.tsx`.
 *
 * `authorized-products.ts` importe `"server-only"` (transitivement via
 * `lib/db/tenant-context.ts`) — ne peut pas être chargé par `node --test`
 * hors bundler Next.js (même contrainte documentée dans
 * tenant-continuity-invariants.test.ts). Vérification statique sur le code
 * source réel.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const authorizedProductsSrc = readFileSync(
  join(process.cwd(), "lib/b2b/authorized-products.ts"),
  "utf8",
)
const listComponentSrc = readFileSync(
  join(process.cwd(), "components/pro/authorized-products-list.tsx"),
  "utf8",
)

test("listAuthorizedProductsForAgency : traite le type 'network' comme les 3 types historiques — filtre + jointure applicative vers `products`", () => {
  assert.match(authorizedProductsSrc, /a\.productType === "network"/)
  assert.match(authorizedProductsSrc, /\.from\(products\)/)
})

test("DISTRIBUTION-02 : BOOKABLE_TYPES inclut 'network' — createNetworkProductBooking existe désormais et est bien câblé dans handleSubmit", () => {
  const constIdx = listComponentSrc.indexOf("const BOOKABLE_TYPES")
  const arrayLine = listComponentSrc.slice(
    constIdx,
    listComponentSrc.indexOf("\n", constIdx),
  )
  assert.match(arrayLine, /\["package", "activity", "network"\]/)
  assert.match(listComponentSrc, /await createNetworkProductBooking\(/)
})

test("TYPE_LABEL couvre 'network' (satisfait Record<AuthorizedProductRow['productType'], string> sans `as any`)", () => {
  assert.match(listComponentSrc, /network: /)
  assert.equal(listComponentSrc.includes(" as any"), false)
})
