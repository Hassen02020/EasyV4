/**
 * HOTEL-ERROR-MESSAGE-01 — aucune réponse publique des routes hôtels ne
 * contient de texte technique ; le code d'erreur (contrat) reste stable.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  MyGoApiError,
  MyGoAuthError,
  MyGoNetworkError,
  MyGoTimeoutError,
} from "@/lib/mygo"
import {
  PUBLIC_HOTEL_ERROR_MESSAGE,
  hotelErrorResponse,
} from "../hotel-error-response"

const SECRET_TEXT =
  "ECONNRESET https://api.mygo.example/Method?login=bob&pwd=hunter2"

async function body(err: unknown) {
  const res = hotelErrorResponse(err, "/api/hotels/test")
  return { status: res.status, json: await res.json() }
}

test("erreur réseau myGo : code stable, aucun texte technique", async () => {
  const r = await body(new MyGoNetworkError(SECRET_TEXT))
  assert.equal(r.status, 502)
  assert.equal(r.json.error, "network")
  assert.equal(r.json.message, PUBLIC_HOTEL_ERROR_MESSAGE)
  assert.ok(!JSON.stringify(r.json).includes("ECONNRESET"))
  assert.ok(!JSON.stringify(r.json).includes("hunter2"))
})

test("timeout, auth, erreur applicative : messages neutres, codes inchangés", async () => {
  const t = await body(new MyGoTimeoutError(15000))
  assert.equal(t.json.error, "timeout")
  assert.ok(!JSON.stringify(t.json).includes("15000"))
  const a = await body(new MyGoAuthError("Check the sending of the login"))
  assert.equal(a.status, 502)
  assert.equal(a.json.error, "auth_failed")
  assert.ok(!JSON.stringify(a.json).includes("login"))
  const p = await body(
    new MyGoApiError("Method", 42, "détail interne fournisseur"),
  )
  assert.equal(p.json.message, PUBLIC_HOTEL_ERROR_MESSAGE)
  assert.ok(!JSON.stringify(p.json).includes("fournisseur"))
})

test("erreur inconnue : 500 « internal », message neutre", async () => {
  const r = await body(new Error("select * from secret_table failed"))
  assert.equal(r.status, 500)
  assert.deepEqual(r.json, {
    error: "internal",
    message: PUBLIC_HOTEL_ERROR_MESSAGE,
  })
  const s = await body("chaîne brute")
  assert.equal(s.status, 500)
})

test("les 4 routes passent par le helper, sans err.message", () => {
  for (const f of [
    "app/api/hotels/list/route.ts",
    "app/api/hotels/cities/route.ts",
    "app/api/hotels/details-public/[id]/route.ts",
    "app/api/hotels/details/[id]/route.ts",
  ]) {
    const src = readFileSync(f, "utf8")
    assert.match(src, /hotelErrorResponse\(err,/, f)
    assert.doesNotMatch(
      src,
      /err\.message|err instanceof Error \? err\.message/,
      f,
    )
  }
})

test("la fiche hôtel n'affiche plus body.message ni un texte serveur", () => {
  const src = readFileSync(
    "app/(public)/[locale]/hotels/[id]/hotel-detail-client.tsx",
    "utf8",
  )
  assert.doesNotMatch(src, /body\.message/)
  assert.doesNotMatch(src, /error:\s*state\.error\s*\?\?/)
  assert.doesNotMatch(src, /roomsState\.error\s*\?\?/)
  assert.match(src, /t\("apiErrorUnavailable"\)/)
})

test("message neutre traduit en fr, en et ar", () => {
  for (const l of ["fr", "en", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).Hotels
    assert.ok(m.apiErrorUnavailable && m.apiErrorUnavailable.length > 10, l)
  }
})
