/**
 * CRM-LEADADS-NO-LOSS-01 (écart G-05) — un prospect Lead Ads n'est plus
 * jamais perdu en silence : tout échec est tracé et rend la réponse 500
 * (Meta relivre) ; le renvoi n'enregistre ni ne notifie deux fois.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { MetaLeadFetchResult } from "../provider"
import {
  processLeadgenBatchCore,
  type LeadgenBatchDeps,
  type LeadgenFailure,
} from "../webhook-batch"

const lead = (id: string) => ({
  leadgenId: id,
  fields: { email: `${id}@example.test` },
  createdTime: null,
})

function makeDeps(opts: {
  fetch?: Record<string, MetaLeadFetchResult>
  captureThrows?: string[]
  alreadyProcessed?: string[]
  recordThrows?: boolean
}) {
  const notified: string[] = []
  const recorded: LeadgenFailure[] = []
  const captured: string[] = []
  const deps: LeadgenBatchDeps = {
    fetchLead: async (id) => opts.fetch?.[id] ?? { ok: true, lead: lead(id) },
    capture: async (l) => {
      if (opts.captureThrows?.includes(l.leadgenId)) throw new Error("db down")
      captured.push(l.leadgenId)
      return {
        leadId: `lead-${l.leadgenId}`,
        contactId: null,
        alreadyProcessed: opts.alreadyProcessed?.includes(l.leadgenId) ?? false,
      }
    },
    notifyCreated: async (leadId) => void notified.push(leadId),
    recordFailure: async (f) => {
      if (opts.recordThrows) throw new Error("audit down")
      recorded.push(f)
    },
  }
  return { deps, notified, recorded, captured }
}

test("tout réussit : leads enregistrés et notifiés, aucun échec", async () => {
  const { deps, notified, recorded } = makeDeps({})
  const r = await processLeadgenBatchCore(["a", "b"], deps)
  assert.deepEqual(r, { processed: 2, failures: [] })
  assert.deepEqual(notified, ["lead-a", "lead-b"])
  assert.deepEqual(recorded, [])
})

test("jeton Meta absent / Graph en erreur : échec tracé, les autres leads du lot passent", async () => {
  const { deps, recorded, captured } = makeDeps({
    fetch: {
      a: { ok: false, code: "META_LEADADS_PROVIDER_NOT_CONFIGURED" },
      c: {
        ok: false,
        code: "META_LEADADS_FETCH_FAILED",
        message: "https://graph.facebook.com/x?access_token=SECRET",
      },
    },
  })
  const r = await processLeadgenBatchCore(["a", "b", "c"], deps)
  assert.equal(r.processed, 1)
  assert.deepEqual(captured, ["b"])
  const expected = [
    { leadgenId: "a", code: "META_LEADADS_PROVIDER_NOT_CONFIGURED" },
    { leadgenId: "c", code: "META_LEADADS_FETCH_FAILED" },
  ]
  assert.deepEqual(r.failures, expected)
  // La trace ne contient que leadgen_id + code : jamais le message brut
  // (URL Graph + jeton) ni une donnée du prospect.
  assert.deepEqual(recorded, expected)
  assert.doesNotMatch(JSON.stringify(recorded), /SECRET|access_token|@/)
})

test("erreur base à l'enregistrement : échec tracé (META_LEADADS_CAPTURE_FAILED)", async () => {
  const { deps, recorded, notified } = makeDeps({ captureThrows: ["a"] })
  const r = await processLeadgenBatchCore(["a"], deps)
  assert.equal(r.processed, 0)
  assert.deepEqual(recorded, [
    { leadgenId: "a", code: "META_LEADADS_CAPTURE_FAILED" },
  ])
  assert.deepEqual(notified, [])
})

test("renvoi Meta après un 500 : lead déjà enregistré → ni doublon ni second email", async () => {
  const { deps, notified } = makeDeps({ alreadyProcessed: ["a"] })
  const r = await processLeadgenBatchCore(["a", "b"], deps)
  assert.deepEqual(r, { processed: 2, failures: [] })
  assert.deepEqual(notified, ["lead-b"])
})

test("trace d'échec impossible : le lot continue et l'échec reste signalé", async () => {
  const { deps, captured } = makeDeps({
    fetch: { a: { ok: false, code: "META_LEADADS_FETCH_FAILED" } },
    recordThrows: true,
  })
  const r = await processLeadgenBatchCore(["a", "b"], deps)
  assert.equal(r.failures.length, 1)
  assert.deepEqual(captured, ["b"])
})

test("route : 500 dès qu'un lead a échoué (Meta relivre), trace audit_events sans donnée personnelle", () => {
  // Les deux routes qui reçoivent `leadgen` (historique et Page unifiée,
  // CRM-META-CONNECT-01) répondent 500 au moindre échec.
  for (const f of [
    "app/api/webhooks/meta-leadads/route.ts",
    "app/api/webhooks/meta-page/route.ts",
  ]) {
    const route = readFileSync(f, "utf8")
    assert.match(
      route,
      /if \(failures\.length > 0\) \{\s*return NextResponse\.json\([\s\S]*?\{ status: 500 \}/,
      f,
    )
    assert.match(route, /processLeadgenIds\(/, f)
    assert.doesNotMatch(route, /continue\n/, f)
  }
  assert.match(
    readFileSync("lib/meta/page-webhook-core.ts", "utf8"),
    /action: LEADADS_FAILURE_ACTION,\s*diff: \{ code: failure\.code \}/,
  )
})
