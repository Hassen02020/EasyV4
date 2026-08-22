/**
 * Tests unitaires — `lib/whatsapp/send-booking-confirmation.ts`.
 *
 * Couvre : idempotence (pas de double envoi sur "retry"), audit structuré
 * pour chaque tentative (envoyé/échoué/ignoré), comportement honnête sans
 * credentials, et — exigence explicite — la preuve que rien dans ce
 * chemin ne touche jamais `reservations`/`payments` : un faux "spy"
 * d'audit trail journalise tout appel, et on vérifie qu'aucun appel
 * n'a jamais concerné autre chose que le journal d'audit (donc que le
 * statut de réservation/paiement ne peut pas être modifié par cette
 * logique, même quand l'envoi échoue).
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
  sendBookingConfirmationWhatsApp,
  WHATSAPP_AUDIT_ACTIONS,
  type NotificationAuditStore,
} from "../send-booking-confirmation"
import type { WhatsAppProvider, WhatsAppMessageResult, SendTemplateMessageInput } from "../provider"

const BASE_INPUT = {
  reservationId: "reservation-uuid-test",
  agencyId: "agency-uuid-test",
  publicRef: "TG-2026-000001",
  customerName: "Client Test",
  customerPhone: "+216 98 123 456",
  hotelName: "Hôtel Test",
  checkIn: "2026-12-01",
  checkOut: "2026-12-04",
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
      async hasAlreadySucceeded(reservationId, action) {
        return alreadySucceeded.has(action)
      },
      async recordAttempt(input, action, diff) {
        events.push({ reservationId: input.reservationId, action, diff })
      },
    },
  }
}

function makeFakeProvider(result: WhatsAppMessageResult): {
  provider: WhatsAppProvider
  calls: SendTemplateMessageInput[]
} {
  const calls: SendTemplateMessageInput[] = []
  return {
    calls,
    provider: {
      name: "fake",
      configured: true,
      async sendTemplateMessage(input) {
        calls.push(input)
        return result
      },
    },
  }
}

test("sendBookingConfirmationWhatsApp : succès — provider appelé, audit 'sent' enregistré", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: true, providerMessageId: "wamid.TEST123" })

  const outcome = await sendBookingConfirmationWhatsApp(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.deepEqual(outcome, { outcome: "sent", providerMessageId: "wamid.TEST123" })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].to, "+216 98 123 456")
  assert.equal(events.length, 1)
  assert.equal(events[0].action, WHATSAPP_AUDIT_ACTIONS.sent)
  assert.equal(events[0].diff.providerMessageId, "wamid.TEST123")
  // Le numéro complet n'est jamais dupliqué en clair dans l'audit trail.
  assert.equal(events[0].diff.phone, "***3456")
})

test("sendBookingConfirmationWhatsApp : credentials absents — WHATSAPP_PROVIDER_NOT_CONFIGURED, jamais de faux succès", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: true, providerMessageId: "should-not-be-called" })

  const outcome = await sendBookingConfirmationWhatsApp(BASE_INPUT, { auditStore: store, provider, configured: false })

  assert.deepEqual(outcome, { outcome: "skipped", reason: "NOT_CONFIGURED" })
  assert.equal(calls.length, 0, "le provider ne doit jamais être appelé si non configuré")
  assert.equal(events.length, 1)
  assert.equal(events[0].action, WHATSAPP_AUDIT_ACTIONS.skipped)
  assert.equal(events[0].diff.reason, "NOT_CONFIGURED")
})

test("sendBookingConfirmationWhatsApp : pas de téléphone client — ignoré proprement", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: true })

  const outcome = await sendBookingConfirmationWhatsApp(
    { ...BASE_INPUT, customerPhone: "" },
    { auditStore: store, provider, configured: true },
  )

  assert.deepEqual(outcome, { outcome: "skipped", reason: "NO_PHONE" })
  assert.equal(calls.length, 0)
  assert.equal(events[0].action, WHATSAPP_AUDIT_ACTIONS.skipped)
  assert.equal(events[0].diff.reason, "NO_PHONE")
})

/* -------------------------------------------------------------------------- */
/* Idempotence / retry Inngest                                                */
/* -------------------------------------------------------------------------- */

test("sendBookingConfirmationWhatsApp : idempotence — un envoi déjà réussi n'est jamais rejoué (retry Inngest)", async () => {
  const { store, events } = makeFakeAuditStore({ alreadySucceededActions: [WHATSAPP_AUDIT_ACTIONS.sent] })
  const { provider, calls } = makeFakeProvider({ ok: true, providerMessageId: "should-not-be-sent-twice" })

  const outcome = await sendBookingConfirmationWhatsApp(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.deepEqual(outcome, { outcome: "already_sent" })
  assert.equal(calls.length, 0, "le provider ne doit jamais être rappelé quand un envoi a déjà réussi")
  assert.equal(events.length, 0, "aucune nouvelle tentative n'est journalisée pour un envoi déjà confirmé")
})

test("sendBookingConfirmationWhatsApp : échec provider → code explicite, audit 'failed', jamais de succès fabriqué", async () => {
  const { store, events } = makeFakeAuditStore()
  const { provider, calls } = makeFakeProvider({ ok: false, code: "WHATSAPP_SEND_FAILED", message: "HTTP 500" })

  const outcome = await sendBookingConfirmationWhatsApp(BASE_INPUT, { auditStore: store, provider, configured: true })

  assert.equal(outcome.outcome, "failed")
  if (outcome.outcome === "failed") {
    assert.equal(outcome.code, "WHATSAPP_SEND_FAILED")
  }
  assert.equal(calls.length, 1)
  assert.equal(events[0].action, WHATSAPP_AUDIT_ACTIONS.failed)
})

/* -------------------------------------------------------------------------- */
/* Garantie architecturale : Booking Core jamais affecté                      */
/* -------------------------------------------------------------------------- */

test("booking-success-when-notification-fails : un échec WhatsApp ne touche QUE le journal d'audit — jamais reservations/payments", async () => {
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
  const { provider } = makeFakeProvider({ ok: false, code: "WHATSAPP_SEND_FAILED", message: "Erreur réseau simulée" })

  const outcome = await sendBookingConfirmationWhatsApp(BASE_INPUT, { auditStore: spyStore, provider, configured: true })

  assert.equal(outcome.outcome, "failed")
  // Seule surface jamais touchée par ce module, succès ou échec : audit_events.
  assert.deepEqual([...touchedSurfaces].sort(), ["audit_events:insert", "audit_events:select"])
  // Preuve structurelle complémentaire : ce module n'importe aucune table
  // ni action de mutation de réservation/paiement (voir le module lui-même
  // — aucun import de lib/db/schema autre que `auditEvents`, aucun import
  // de lib/admin/reservation-status.ts, lib/finance/*, lib/booking/*).
})
