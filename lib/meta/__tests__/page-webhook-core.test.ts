/**
 * META-CRM-E2E-01 (lot 2) — fonctions pures du webhook Page : lecture des
 * notifications `leadgen` (Page, formulaire), tri envoi de test / autre
 * Page, trace de provenance. Sans base, sans réseau.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  extractLeadgenEvents,
  extractLeadgenIds,
  META_SAMPLE_LEADGEN_ID,
  partitionLeadgenEvents,
} from "../page-webhook-core"
import { metaLeadOriginNotes } from "@/lib/meta-leadads/lead-capture-core"

const payload = {
  object: "page",
  entry: [
    {
      id: "PAGE-A",
      changes: [
        {
          field: "leadgen",
          value: { leadgen_id: "L1", page_id: "PAGE-A", form_id: "F1" },
        },
        { field: "leadgen", value: { leadgen_id: "L2" } },
        { field: "feed", value: { leadgen_id: "X" } },
        { field: "leadgen", value: {} },
      ],
    },
  ],
}

test("extractLeadgenEvents : Page (value.page_id, sinon entry.id) et formulaire ; autres champs ignorés", () => {
  assert.deepEqual(extractLeadgenEvents(payload), [
    { leadgenId: "L1", pageId: "PAGE-A", formId: "F1" },
    { leadgenId: "L2", pageId: "PAGE-A", formId: null },
  ])
  assert.deepEqual(extractLeadgenIds(payload), ["L1", "L2"])
})

test("partition : l'envoi de test Meta est toujours ignoré ; sans META_PAGE_ID aucune Page n'est filtrée", () => {
  assert.equal(META_SAMPLE_LEADGEN_ID, "444444444444")
  const events = [
    { leadgenId: "444444444444", pageId: "444444444444", formId: null },
    { leadgenId: "L1", pageId: "P1", formId: null },
    { leadgenId: "L2", pageId: null, formId: null },
  ]
  assert.deepEqual(partitionLeadgenEvents(events, null), {
    accepted: [events[1], events[2]],
    ignored: [{ leadgenId: "444444444444", reason: "meta_sample" }],
  })
})

test("partition : avec META_PAGE_ID, une autre Page (ou une Page inconnue) est ignorée", () => {
  const events = [
    { leadgenId: "L1", pageId: "P1", formId: null },
    { leadgenId: "L2", pageId: "P2", formId: null },
    { leadgenId: "L3", pageId: null, formId: null },
  ]
  assert.deepEqual(partitionLeadgenEvents(events, "P1"), {
    accepted: [events[0]],
    ignored: [
      { leadgenId: "L2", reason: "foreign_page" },
      { leadgenId: "L3", reason: "foreign_page" },
    ],
  })
})

test("trace de provenance : page_id / form_id, champs absents omis", () => {
  assert.equal(
    metaLeadOriginNotes({ pageId: "P1", formId: "F1" }),
    "page_id=P1; form_id=F1",
  )
  assert.equal(
    metaLeadOriginNotes({ pageId: "P1", formId: null }),
    "page_id=P1",
  )
  assert.equal(metaLeadOriginNotes({ pageId: null, formId: null }), null)
  assert.equal(metaLeadOriginNotes(undefined), null)
})
