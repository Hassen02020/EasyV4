/**
 * Tests unitaires — `lib/crm/sync-booking.ts`.
 *
 * Même couverture que lib/whatsapp/__tests__/send-booking-confirmation.test.ts :
 * idempotence, audit structuré, honnêteté sans provider configuré, et
 * preuve que ce chemin ne touche jamais reservations/payments.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { syncBookingToCrm, CRM_AUDIT_ACTIONS } from "../sync-booking"
import type { NotificationAuditStore } from "@/lib/whatsapp/send-booking-confirmation"
import type { CrmProvider, CrmSyncResult, SyncBookingInput } from "../provider"

const BASE_INPUT = {
  reservationId: "reservation-uuid-test",
  agencyId: "agency-uuid-test",
  publicRef: "TG-2026-000001",
  customerEmail: "client@example.com",
  customerName: "Client Test",
  customerPhone: "+21698123456",
  totalTnd: 1200,
}

type AuditEvent = { reservationId: string; action: string; diff: Record<string, unknown> }

function makeFakeAuditStore(opts: { alreadySucceededActions?: string[] } = {}): {
  store: NotificationAuditStore
  events: AuditEvent[]
} {
  const events: AuditEvent[] = []
  const alreadySucceeded = new Set(opts.alreadySucceededActions ?? [])
  return {
    events,
    store: {
      async hasAlreadySucceeded(_reservationId, action) {
        return alreadySucceeded.has(action)
      },
      async recordAttempt(input, action, diff) {
        events.push({ reservationId: input.reservationId, action, diff })
      },
    },
  }
}

function makeFakeProvider(result: CrmSyncResult): { provider: CrmProvider; calls: SyncBookingInput[] } {
  const calls: SyncBookingInput[] = []
  return {
    calls,
    provider: {
      name: "fake",
      configured: true,
      async syncBooking(input) {
        calls.push(input)
        return result
      },
    },
  }
}

test("syncBookingToCrm : non configuré (comportement par défaut du projet) — jamais de fausse synchronisation", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: true, providerRecordId: "should-not-be-called" })

  const outcome = await syncBookingToCrm(BASE_INPUT, { auditStore: store, provider, configured: false })

  assert.deepEqual(outcome, { outcome: "skipped", reason: "NOT_CONFIGURED" })
  assert.equal(calls.length, 0)
  assert.equal(events[0].action, CRM_AUDIT_ACTIONS.skipped)
})

test("syncBookingToCrm : idempotence — une synchronisation déjà réussie n'est jamais rejouée", async () => {
  const { store, events } = makeFakeAuditStore({ alreadySucceededActions: [CRM_AUDIT_ACTIONS.synced] })
  const { provider, calls } = makeFakeProvider({ ok: true, providerRecordId: "should-not-sync-twice" })

  const outcome = await syncBookingToCrm(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.deepEqual(outcome, { outcome: "already_synced" })
  assert.equal(calls.length, 0)
  assert.equal(events.length, 0)
})

test("syncBookingToCrm : succès (adaptateur futur hypothétique) — audit 'synced' enregistré", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: true, providerRecordId: "crm-record-123" })

  const outcome = await syncBookingToCrm(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.deepEqual(outcome, { outcome: "synced", providerRecordId: "crm-record-123" })
  assert.equal(calls.length, 1)
  assert.equal(events[0].action, CRM_AUDIT_ACTIONS.synced)
})

test("syncBookingToCrm : échec provider → code explicite, audit 'failed'", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider } = makeFakeProvider({ ok: false, code: "CRM_SYNC_FAILED", message: "Timeout" })

  const outcome = await syncBookingToCrm(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.equal(outcome.outcome, "failed")
  assert.equal(events[0].action, CRM_AUDIT_ACTIONS.failed)
})

test("booking-success-when-notification-fails : un échec CRM ne touche QUE le journal d'audit — jamais reservations/payments", async () => {
  const touchedSurfaces = new Set<string>()
  const spyStore: NotificationAuditStore = {
    async hasAlreadySucceeded() {
      touchedSurfaces.add("audit_events:select")
      return false
    },
    async recordAttempt() {
      touchedSurfaces.add("audit_events:insert")
    },
  }
  const { provider } = makeFakeProvider({ ok: false, code: "CRM_SYNC_FAILED", message: "Erreur simulée" })

  const outcome = await syncBookingToCrm(BASE_INPUT, { auditStore: spyStore, provider, configured: true })

  assert.equal(outcome.outcome, "failed")
  assert.deepEqual([...touchedSurfaces].sort(), ["audit_events:insert", "audit_events:select"])
})
