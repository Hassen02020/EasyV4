/**
 * Attente de disponibilité des tests e2e (e2e/support/wait-for-route.ts) :
 * succès seulement sur HTTP 200 + contenu attendu ; rien n'est masqué ;
 * échec explicite et borné sinon.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  RouteNotReadyError,
  warmupTimeoutMs,
  waitForRoute,
  type ProbeResponse,
  type RouteProbe,
} from "../../../e2e/support/wait-for-route"

const probe: RouteProbe = {
  label: "saisie voyageur",
  path: "/fr/booking/travelers?d=SECRET_DRAFT",
  check: ({ body }) =>
    body.includes("TITRE_ATTENDU") ? null : "route inattendue",
}

/** Horloge simulée : `sleep` avance le temps, aucun délai réel. */
function clock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
  }
}

const ok: ProbeResponse = { status: 200, body: "<html>TITRE_ATTENDU</html>" }
const seq = (...items: Array<ProbeResponse | Error>) => {
  let i = 0
  return async () => {
    const it = items[Math.min(i++, items.length - 1)]!
    if (it instanceof Error) throw it
    return it
  }
}
const opts = (c = clock()) => ({
  timeoutMs: 10_000,
  intervalMs: 1000,
  now: c.now,
  sleep: c.sleep,
})

test("404 transitoire puis 200 conforme → succès, nombre d'essais exact", async () => {
  const r = await waitForRoute(
    seq({ status: 404, body: "" }, { status: 500, body: "" }, ok),
    probe,
    opts(),
  )
  assert.equal(r.attempts, 3)
})

test("200 immédiat conforme → un seul essai", async () => {
  assert.equal((await waitForRoute(seq(ok), probe, opts())).attempts, 1)
})

test("404 persistant → ÉCHEC avec le dernier statut HTTP, la route et le libellé", async () => {
  await assert.rejects(
    waitForRoute(
      seq({
        status: 404,
        body: "<title>404: This page could not be found.</title>",
      }),
      probe,
      opts(),
    ),
    (e: Error) => {
      assert.ok(e instanceof RouteNotReadyError)
      assert.match(e.message, /dernier statut HTTP : 404/)
      assert.match(e.message, /saisie voyageur/)
      assert.match(e.message, /\/fr\/booking\/travelers/)
      assert.match(e.message, /404: This page could not be found/)
      // La requête (brouillon) n'est jamais recopiée dans le message.
      assert.doesNotMatch(e.message, /SECRET_DRAFT/)
      return true
    },
  )
})

test("500 persistant → ÉCHEC « HTTP 500 », jamais masqué", async () => {
  await assert.rejects(
    waitForRoute(seq({ status: 500, body: "boom" }), probe, opts()),
    /dernier statut HTTP : 500.*raison : HTTP 500/,
  )
})

test("redirection (3xx) ou 204 → non disponible, jamais assimilé à un succès", async () => {
  for (const status of [301, 302, 307, 204]) {
    await assert.rejects(
      waitForRoute(seq({ status, body: "TITRE_ATTENDU" }), probe, opts()),
      new RegExp(`HTTP ${status}`),
    )
  }
})

test("200 d'une AUTRE page (contenu inattendu) → ÉCHEC « route inattendue »", async () => {
  await assert.rejects(
    waitForRoute(
      seq({ status: 200, body: "<title>Accueil</title>" }),
      probe,
      opts(),
    ),
    /dernier statut HTTP : 200.*raison : route inattendue.*Accueil/,
  )
})

test("serveur injoignable → ÉCHEC avec la dernière erreur réseau", async () => {
  await assert.rejects(
    waitForRoute(
      seq(new Error("connect ECONNREFUSED 127.0.0.1:3000\n at ...")),
      probe,
      opts(),
    ),
    (e: Error) => {
      assert.match(
        e.message,
        /dernière erreur réseau : connect ECONNREFUSED 127\.0\.0\.1:3000/,
      )
      assert.doesNotMatch(e.message, /at \.\.\./)
      return true
    },
  )
})

test("délai maximal respecté : tentatives bornées, échec sans attente infinie", async () => {
  const c = clock()
  let calls = 0
  await assert.rejects(
    waitForRoute(
      async () => {
        calls++
        return { status: 404, body: "" }
      },
      probe,
      { timeoutMs: 5000, intervalMs: 1000, now: c.now, sleep: c.sleep },
    ),
    /délai max 5000 ms/,
  )
  assert.ok(calls >= 4 && calls <= 6, `essais=${calls}`)
  assert.ok(c.now() <= 5000)
})

test("réseau d'abord en panne puis rétabli → succès (démarrage lent)", async () => {
  const r = await waitForRoute(
    seq(new Error("ECONNREFUSED"), new Error("ECONNREFUSED"), ok),
    probe,
    opts(),
  )
  assert.equal(r.attempts, 3)
})

test("délai par défaut surchargeable par E2E_WARMUP_TIMEOUT_MS, valeurs invalides ignorées", () => {
  assert.equal(warmupTimeoutMs({}), 120_000)
  assert.equal(warmupTimeoutMs({ E2E_WARMUP_TIMEOUT_MS: "4000" }), 4000)
  for (const bad of ["", "abc", "-5", "0"]) {
    assert.equal(warmupTimeoutMs({ E2E_WARMUP_TIMEOUT_MS: bad }), 120_000)
  }
})

test("la spec n'utilise plus un GET dont le statut serait ignoré à l'échauffement", async () => {
  const { readFileSync } = await import("node:fs")
  const src = readFileSync("e2e/draft-pii-url-cookie.spec.ts", "utf8")
  assert.match(src, /waitForRoute\(fetcher, probe\)/)
  assert.doesNotMatch(src, /await request\.get\(path, \{ timeout: 120_000/)
})
